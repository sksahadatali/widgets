import { constants } from 'node:fs';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  getRuntimeStoreOptions,
  type StoreAccessPolicy,
} from '../config/runtimeData.js';

import type {
  CreateMealPlanEntryInput,
  MealPlanEntry,
  MealPlanStoreData,
  MealType,
  UpdateMealPlanEntryInput,
} from '../types/mealPlan.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LOCAL_DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_TITLE_LENGTH = 160;
const MEAL_TYPES: readonly MealType[] = [
  'breakfast',
  'lunch',
  'dinner',
];

type StoreUpdate<T> = {
  store: MealPlanStoreData;
  result: T;
  changed?: boolean;
};

export type MealEntryMutationResult = {
  entry: MealPlanEntry;
  created: boolean;
};

export type RemoveMealEntryResult = {
  removed: boolean;
};

export class MealPlanStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MealPlanStoreError';
  }
}

export class MealPlanStoreCorruptError
  extends MealPlanStoreError {
  constructor(message: string) {
    super(message);
    this.name = 'MealPlanStoreCorruptError';
  }
}

export class MealPlanNotFoundError
  extends MealPlanStoreError {
  constructor(message: string) {
    super(message);
    this.name = 'MealPlanNotFoundError';
  }
}

export class MealPlanConflictError
  extends MealPlanStoreError {
  constructor(message: string) {
    super(message);
    this.name = 'MealPlanConflictError';
  }
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: string[]
): boolean {
  return Object.keys(value).every(
    key => keys.includes(key)
  );
}

function isCanonicalUuid(
  value: unknown
): value is string {
  return typeof value === 'string' &&
    UUID_PATTERN.test(value);
}

function isIsoTimestamp(
  value: unknown
): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);

  return !Number.isNaN(parsed) &&
    value === new Date(parsed).toISOString();
}

export function isMealLocalDate(
  value: unknown
): value is string {
  if (typeof value !== 'string') return false;
  const match = LOCAL_DATE_PATTERN.exec(value);

  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  return year >= 1000 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function isMealType(
  value: unknown
): value is MealType {
  return typeof value === 'string' &&
    MEAL_TYPES.includes(value as MealType);
}

function isNormalizedTitle(
  value: unknown
): value is string {
  return typeof value === 'string' &&
    Boolean(value) &&
    value === value.trim() &&
    value.length <= MAX_TITLE_LENGTH;
}

function isMealPlanEntry(
  value: unknown
): value is MealPlanEntry {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'id',
      'localDate',
      'mealType',
      'title',
      'createdAt',
      'updatedAt',
    ]) ||
    Object.keys(value).length !== 6 ||
    !isCanonicalUuid(value.id) ||
    !isMealLocalDate(value.localDate) ||
    !isMealType(value.mealType) ||
    !isNormalizedTitle(value.title) ||
    !isIsoTimestamp(value.createdAt) ||
    !isIsoTimestamp(value.updatedAt)
  ) {
    return false;
  }

  return Date.parse(value.updatedAt) >=
    Date.parse(value.createdAt);
}

export function validateMealPlanStore(
  value: unknown
): MealPlanStoreData {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['schemaVersion', 'entries']) ||
    Object.keys(value).length !== 2 ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.entries) ||
    !value.entries.every(isMealPlanEntry)
  ) {
    throw new MealPlanStoreCorruptError(
      'The local Meals store is malformed or has an unsupported schema. It was not changed.'
    );
  }

  const store = value as MealPlanStoreData;
  const ids = store.entries.map(entry => entry.id);

  if (new Set(ids).size !== ids.length) {
    throw new MealPlanStoreCorruptError(
      'The local Meals store violates identity invariants. It was not changed.'
    );
  }

  return store;
}

function createInitialStore(): MealPlanStoreData {
  return {
    schemaVersion: 1,
    entries: [],
  };
}

function normalizeUuid(
  value: unknown,
  field: string
): string {
  if (!isCanonicalUuid(value)) {
    throw new MealPlanStoreError(
      `Meals ${field} must be a canonical lowercase UUID.`
    );
  }

  return value;
}

function normalizeLocalDate(
  value: unknown
): string {
  if (!isMealLocalDate(value)) {
    throw new MealPlanStoreError(
      'Meal date must be a real Gregorian date using YYYY-MM-DD.'
    );
  }

  return value;
}

function normalizeMealType(
  value: unknown
): MealType {
  if (!isMealType(value)) {
    throw new MealPlanStoreError(
      'Meal type must be breakfast, lunch or dinner.'
    );
  }

  return value;
}

function normalizeTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new MealPlanStoreError(
      'Meal title is required.'
    );
  }

  const title = value.trim();

  if (!title || title.length > MAX_TITLE_LENGTH) {
    throw new MealPlanStoreError(
      `Meal title must be from 1 to ${MAX_TITLE_LENGTH} characters.`
    );
  }

  return title;
}

function normalizeCreateInput(
  input: unknown
): CreateMealPlanEntryInput {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, [
      'id',
      'localDate',
      'mealType',
      'title',
    ]) ||
    Object.keys(input).length !== 4
  ) {
    throw new MealPlanStoreError(
      'Meal details are invalid.'
    );
  }

  return {
    id: normalizeUuid(input.id, 'entry ID'),
    localDate: normalizeLocalDate(input.localDate),
    mealType: normalizeMealType(input.mealType),
    title: normalizeTitle(input.title),
  };
}

function normalizeUpdateInput(
  input: unknown
): UpdateMealPlanEntryInput {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, [
      'title',
      'localDate',
      'mealType',
    ]) ||
    Object.keys(input).length === 0
  ) {
    throw new MealPlanStoreError(
      'Meal update is invalid.'
    );
  }

  const hasTitle =
    Object.hasOwn(input, 'title');
  const hasDate =
    Object.hasOwn(input, 'localDate');
  const hasMealType =
    Object.hasOwn(input, 'mealType');

  if (hasDate !== hasMealType) {
    throw new MealPlanStoreError(
      'A meal move requires both localDate and mealType.'
    );
  }

  return {
    ...(hasTitle
      ? { title: normalizeTitle(input.title) }
      : {}),
    ...(hasDate
      ? {
        localDate:
          normalizeLocalDate(input.localDate),
        mealType:
          normalizeMealType(input.mealType),
      }
      : {}),
  };
}

function shiftLocalDate(
  localDate: string,
  days: number
): string {
  const match = LOCAL_DATE_PATTERN.exec(localDate)!;
  const date = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]) + days
  ));

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function insertAfterTargetSlot(
  entries: MealPlanEntry[],
  entry: MealPlanEntry
): void {
  let lastTargetIndex = -1;

  entries.forEach((candidate, index) => {
    if (
      candidate.localDate === entry.localDate &&
      candidate.mealType === entry.mealType
    ) {
      lastTargetIndex = index;
    }
  });

  if (lastTargetIndex < 0) {
    entries.push(entry);
    return;
  }

  entries.splice(lastTargetIndex + 1, 0, entry);
}

async function fileExists(
  filePath: string
): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export class MealPlanFileStore {
  private writeQueue: Promise<void> =
    Promise.resolve();

  private readonly filePath: string;
  private readonly accessPolicy: StoreAccessPolicy;

  constructor(
    filePath?: string,
    accessPolicy?: StoreAccessPolicy
  ) {
    const runtime = getRuntimeStoreOptions(
      'meals.local.json'
    );
    this.filePath = filePath ?? runtime.filePath;
    this.accessPolicy = accessPolicy ?? (
      filePath ? 'initialize' : runtime.policy
    );
  }

  get backupPath(): string {
    return `${this.filePath}.bak`;
  }

  private async readExisting():
    Promise<MealPlanStoreData | null> {
    if (this.accessPolicy === 'disabled') {
      throw new MealPlanStoreError(
        'The Meals datastore is disabled in Demo mode.'
      );
    }

    let raw: string;

    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (
        isRecord(error) &&
        error.code === 'ENOENT'
      ) {
        if (this.accessPolicy === 'required') {
          throw new MealPlanStoreError(
            'The required Meals datastore is missing.'
          );
        }
        return null;
      }

      throw error;
    }

    try {
      return validateMealPlanStore(
        JSON.parse(raw) as unknown
      );
    } catch (error) {
      if (error instanceof MealPlanStoreCorruptError) {
        throw error;
      }

      throw new MealPlanStoreCorruptError(
        'The local Meals store is malformed. It was not changed.'
      );
    }
  }

  private async replace(
    nextStore: MealPlanStoreData,
    retainBackup: boolean
  ): Promise<void> {
    validateMealPlanStore(nextStore);
    if (this.accessPolicy === 'initialize') {
      await mkdir(dirname(this.filePath), {
        recursive: true,
      });
    }

    const suffix =
      `${process.pid}.${Date.now()}.${crypto.randomUUID()}`;
    const temporaryPath =
      `${this.filePath}.${suffix}.tmp`;
    const backupTemporaryPath =
      `${this.backupPath}.${suffix}.tmp`;

    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify(nextStore, null, 2)}\n`,
        { encoding: 'utf8', flag: 'wx' }
      );

      if (
        retainBackup &&
        await fileExists(this.filePath)
      ) {
        await copyFile(
          this.filePath,
          backupTemporaryPath
        );
        await rename(
          backupTemporaryPath,
          this.backupPath
        );
      }

      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await unlink(temporaryPath)
        .catch(() => undefined);
      await unlink(backupTemporaryPath)
        .catch(() => undefined);
      throw error;
    }
  }

  private async mutate<T>(
    update: (
      store: MealPlanStoreData
    ) => StoreUpdate<T>
  ): Promise<T> {
    let operationResult: T | undefined;
    let operationError: unknown;

    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          const existing = await this.readExisting();
          const current =
            existing ?? createInitialStore();
          const updated = update(
            structuredClone(current)
          );
          validateMealPlanStore(updated.store);

          if (
            updated.changed !== false ||
            existing === null
          ) {
            await this.replace(
              updated.store,
              existing !== null
            );
          }

          operationResult = updated.result;
        } catch (error) {
          operationError = error;
        }
      });

    await this.writeQueue;

    if (operationError) throw operationError;
    return operationResult as T;
  }

  async read(): Promise<MealPlanStoreData> {
    return this.mutate(store => ({
      store,
      result: structuredClone(store),
      changed: false,
    }));
  }

  async readWindow(
    windowStartValue: unknown
  ): Promise<MealPlanEntry[]> {
    const windowStart =
      normalizeLocalDate(windowStartValue);
    const windowEnd =
      shiftLocalDate(windowStart, 6);

    return this.mutate(store => ({
      store,
      result: structuredClone(
        store.entries.filter(entry =>
          entry.localDate >= windowStart &&
          entry.localDate <= windowEnd
        )
      ),
      changed: false,
    }));
  }

  async createEntry(
    input: unknown,
    now = new Date()
  ): Promise<MealEntryMutationResult> {
    const normalized = normalizeCreateInput(input);

    return this.mutate<MealEntryMutationResult>(store => {
      const existing = store.entries.find(
        entry => entry.id === normalized.id
      );

      if (existing) {
        if (
          existing.localDate === normalized.localDate &&
          existing.mealType === normalized.mealType &&
          existing.title === normalized.title
        ) {
          return {
            store,
            result: {
              entry: existing,
              created: false,
            },
            changed: false,
          };
        }

        throw new MealPlanConflictError(
          'Meal entry ID is already used by a different entry.'
        );
      }

      const timestamp = now.toISOString();
      const entry: MealPlanEntry = {
        ...normalized,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      insertAfterTargetSlot(store.entries, entry);

      return {
        store,
        result: { entry, created: true },
      };
    });
  }

  async updateEntry(
    entryId: string,
    input: unknown,
    now = new Date()
  ): Promise<MealEntryMutationResult> {
    const id = normalizeUuid(entryId, 'entry ID');
    const normalized = normalizeUpdateInput(input);

    return this.mutate<MealEntryMutationResult>(store => {
      const index = store.entries.findIndex(
        entry => entry.id === id
      );

      if (index < 0) {
        throw new MealPlanNotFoundError(
          'Meal entry was not found.'
        );
      }

      const entry = store.entries[index];
      const nextTitle =
        normalized.title ?? entry.title;
      const nextLocalDate =
        normalized.localDate ?? entry.localDate;
      const nextMealType =
        normalized.mealType ?? entry.mealType;
      const slotChanged =
        nextLocalDate !== entry.localDate ||
        nextMealType !== entry.mealType;

      if (
        !slotChanged &&
        nextTitle === entry.title
      ) {
        return {
          store,
          result: { entry, created: false },
          changed: false,
        };
      }

      const updatedEntry: MealPlanEntry = {
        ...entry,
        title: nextTitle,
        localDate: nextLocalDate,
        mealType: nextMealType,
        updatedAt: now.toISOString(),
      };

      if (slotChanged) {
        store.entries.splice(index, 1);
        insertAfterTargetSlot(
          store.entries,
          updatedEntry
        );
      } else {
        store.entries[index] = updatedEntry;
      }

      return {
        store,
        result: {
          entry: updatedEntry,
          created: false,
        },
      };
    });
  }

  async removeEntry(
    entryId: string
  ): Promise<RemoveMealEntryResult> {
    const id = normalizeUuid(entryId, 'entry ID');

    return this.mutate<RemoveMealEntryResult>(store => {
      const index = store.entries.findIndex(
        entry => entry.id === id
      );

      if (index < 0) {
        return {
          store,
          result: { removed: false },
          changed: false,
        };
      }

      store.entries.splice(index, 1);

      return {
        store,
        result: { removed: true },
      };
    });
  }
}

export const mealPlanStore =
  new MealPlanFileStore();
