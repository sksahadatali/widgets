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
  IsoWeekday,
  LegacyRoutineOccurrence,
  LegacyRoutineStoreDataV2,
  LegacyRoutineStoreData,
  RoutineDefinition,
  RoutineDefinitionInput,
  RoutineMaterializationInput,
  RoutineOccurrence,
  RoutineOccurrenceSnapshot,
  RoutineOccurrenceUpdate,
  RoutineSchedule,
  RoutineStep,
  RoutineStoreData,
} from '../types/routine.js';

const EMPTY_STORE: RoutineStoreData = {
  schemaVersion: 3,
  routines: [],
  occurrences: [],
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAY_BY_NAME: Record<string, IsoWeekday> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

type LoadedStore = {
  store: RoutineStoreData;
  migrated: boolean;
};

type StoreUpdate<T> = {
  store: RoutineStoreData;
  result: T;
  changed?: boolean;
};

function isLocalDate(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !DATE_PATTERN.test(value)
  ) {
    return false;
  }

  const [year, month, day] = value
    .split('-')
    .map(Number);
  const candidate = new Date(
    Date.UTC(year, month - 1, day)
  );

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

export class RoutineStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoutineStoreError';
  }
}

export class RoutineStoreCorruptError extends RoutineStoreError {
  constructor(message: string) {
    super(message);
    this.name = 'RoutineStoreCorruptError';
  }
}

export class RoutineNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoutineNotFoundError';
  }
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    !Number.isNaN(Date.parse(value))
  );
}

function isTimeOrNull(
  value: unknown
): value is string | null {
  return (
    value === null ||
    (
      typeof value === 'string' &&
      TIME_PATTERN.test(value)
    )
  );
}

function isRoutineSchedule(
  value: unknown
): value is RoutineSchedule {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.daysOfWeek) &&
    value.daysOfWeek.length > 0 &&
    value.daysOfWeek.every(
      day =>
        Number.isInteger(day) &&
        day >= 1 &&
        day <= 7
    ) &&
    new Set(value.daysOfWeek).size ===
      value.daysOfWeek.length &&
    isTimeOrNull(value.startTime) &&
    isTimeOrNull(value.endTime) &&
    (
      value.endTime === null ||
      (
        value.startTime !== null &&
        value.endTime > value.startTime
      )
    )
  );
}

function isRoutineSteps(
  value: unknown
): value is RoutineStep[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      step =>
        isRecord(step) &&
        typeof step.id === 'string' &&
        Boolean(step.id.trim()) &&
        typeof step.title === 'string' &&
        Boolean(step.title.trim())
    ) &&
    new Set(
      value.map(step =>
        isRecord(step)
          ? step.id
          : undefined
      )
    ).size === value.length
  );
}

function isRoutineDefinition(
  value: unknown
): value is RoutineDefinition {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    Boolean(value.id.trim()) &&
    typeof value.title === 'string' &&
    Boolean(value.title.trim()) &&
    typeof value.ownerProfileId === 'string' &&
    Boolean(value.ownerProfileId.trim()) &&
    typeof value.active === 'boolean' &&
    isRoutineSchedule(value.schedule) &&
    isRoutineSteps(value.steps) &&
    isRoutineReward(value.reward) &&
    isIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.updatedAt)
  );
}

function isRoutineReward(
  value: unknown
): boolean {
  return value === null || (
    isRecord(value) &&
    typeof value.recipientProfileId === 'string' &&
    Boolean(value.recipientProfileId.trim()) &&
    value.recipientProfileId !== 'family' &&
    value.currency === 'star' &&
    Number.isSafeInteger(value.amount) &&
    Number(value.amount) >= 1 &&
    Number(value.amount) <= 100
  );
}

function isLegacyRoutineDefinition(
  value: unknown
): boolean {
  return isRecord(value) &&
    isRoutineDefinition({ ...value, reward: null });
}

function isOccurrenceBase(
  value: unknown
): value is LegacyRoutineOccurrence {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.routineId === 'string' &&
    Boolean(value.routineId.trim()) &&
    isLocalDate(value.localDate) &&
    value.id ===
      `${value.routineId}@${value.localDate}` &&
    typeof value.timeZone === 'string' &&
    Boolean(value.timeZone.trim()) &&
    isRecord(value.completedSteps) &&
    Object.entries(value.completedSteps).every(
      ([stepId, completedAt]) =>
        Boolean(stepId.trim()) &&
        isIsoTimestamp(completedAt)
    ) &&
    (
      value.completedAt === null ||
      isIsoTimestamp(value.completedAt)
    ) &&
    isIsoTimestamp(value.updatedAt)
  );
}

function isOccurrenceSnapshot(
  value: unknown
): value is RoutineOccurrenceSnapshot {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    Boolean(value.title.trim()) &&
    typeof value.ownerProfileId === 'string' &&
    Boolean(value.ownerProfileId.trim()) &&
    isRoutineSchedule(value.schedule) &&
    isRoutineSteps(value.steps) &&
    isIsoTimestamp(value.definitionUpdatedAt) &&
    isIsoTimestamp(value.capturedAt) &&
    (
      value.source === 'captured' ||
      value.source === 'legacy-migration'
    )
  );
}

function isRoutineOccurrence(
  value: unknown
): value is RoutineOccurrence {
  return (
    isRecord(value) &&
    isOccurrenceSnapshot(value.snapshot) &&
    isRoutineReward(value.rewardContract) &&
    Number.isSafeInteger(value.completionSequence) &&
    Number(value.completionSequence) >= 0 &&
    isOccurrenceBase(value)
  );
}

function validateStoreRelationships(
  routines: Array<{ id: string }>,
  occurrences: Array<{
    id: string;
    routineId: string;
  }>
): void {
  const routineIds = routines.map(
    routine => routine.id
  );
  const occurrenceIds = occurrences.map(
    occurrence => occurrence.id
  );
  const routineIdSet = new Set(routineIds);

  if (
    routineIdSet.size !== routineIds.length ||
    new Set(occurrenceIds).size !== occurrenceIds.length ||
    occurrences.some(
      occurrence =>
        !routineIdSet.has(occurrence.routineId)
    )
  ) {
    throw new RoutineStoreCorruptError(
      'The local routines store contains invalid relationships or duplicate IDs. It was not changed.'
    );
  }
}

export function validateRoutineStore(
  value: unknown
): RoutineStoreData {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 3 ||
    !Array.isArray(value.routines) ||
    !value.routines.every(isRoutineDefinition) ||
    !Array.isArray(value.occurrences) ||
    !value.occurrences.every(isRoutineOccurrence)
  ) {
    throw new RoutineStoreCorruptError(
      'The local routines store is malformed. It was not changed.'
    );
  }

  validateStoreRelationships(
    value.routines,
    value.occurrences
  );

  return value as RoutineStoreData;
}

export function validateLegacyRoutineStore(
  value: unknown
): LegacyRoutineStoreData {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.routines) ||
    !value.routines.every(isLegacyRoutineDefinition) ||
    !Array.isArray(value.occurrences) ||
    !value.occurrences.every(isOccurrenceBase)
  ) {
    throw new RoutineStoreCorruptError(
      'The local routines store is malformed. It was not changed.'
    );
  }

  validateStoreRelationships(
    value.routines,
    value.occurrences
  );

  return value as LegacyRoutineStoreData;
}

export function validateLegacyRoutineStoreV2(
  value: unknown
): LegacyRoutineStoreDataV2 {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    !Array.isArray(value.routines) ||
    !value.routines.every(isLegacyRoutineDefinition) ||
    !Array.isArray(value.occurrences) ||
    !value.occurrences.every(occurrence =>
      isRecord(occurrence) &&
      isOccurrenceSnapshot(occurrence.snapshot) &&
      isOccurrenceBase(occurrence)
    )
  ) {
    throw new RoutineStoreCorruptError(
      'The local routines store is malformed. It was not changed.'
    );
  }

  validateStoreRelationships(
    value.routines as LegacyRoutineStoreDataV2['routines'],
    value.occurrences as LegacyRoutineStoreDataV2['occurrences']
  );

  return value as LegacyRoutineStoreDataV2;
}

function createSnapshot(
  routine: Omit<RoutineDefinition, 'reward'>,
  capturedAt: string,
  source: RoutineOccurrenceSnapshot['source']
): RoutineOccurrenceSnapshot {
  return {
    title: routine.title,
    ownerProfileId: routine.ownerProfileId,
    schedule: structuredClone(routine.schedule),
    steps: structuredClone(routine.steps),
    definitionUpdatedAt: routine.updatedAt,
    capturedAt,
    source,
  };
}

export function migrateLegacyRoutineStore(
  legacyStore: LegacyRoutineStoreData,
  migratedAt = new Date().toISOString()
): LegacyRoutineStoreDataV2 {
  const routineById = new Map(
    legacyStore.routines.map(routine => [
      routine.id,
      routine,
    ])
  );
  const migrated: LegacyRoutineStoreDataV2 = {
    schemaVersion: 2,
    routines: structuredClone(
      legacyStore.routines
    ),
    occurrences: legacyStore.occurrences.map(
      occurrence => {
        const routine = routineById.get(
          occurrence.routineId
        );

        if (!routine) {
          throw new RoutineStoreCorruptError(
            'The local routines store contains an occurrence without a routine. It was not changed.'
          );
        }

        return {
          ...structuredClone(occurrence),
          snapshot: createSnapshot(
            routine,
            migratedAt,
            'legacy-migration'
          ),
        };
      }
    ),
  };

  return validateLegacyRoutineStoreV2(migrated);
}

export function migrateRoutineStoreV2(
  legacyStore: LegacyRoutineStoreDataV2
): RoutineStoreData {
  const migrated: RoutineStoreData = {
    schemaVersion: 3,
    routines: legacyStore.routines.map(routine => ({
      ...structuredClone(routine),
      reward: null,
    })),
    occurrences: legacyStore.occurrences.map(occurrence => ({
      ...structuredClone(occurrence),
      rewardContract: null,
      completionSequence:
        occurrence.snapshot.steps.every(step =>
          Boolean(occurrence.completedSteps[step.id])
        )
          ? 1
          : 0,
    })),
  };

  return validateRoutineStore(migrated);
}

function normalizeDefinitionInput(
  input: unknown
): RoutineDefinitionInput {
  if (
    !isRecord(input) ||
    typeof input.active !== 'boolean'
  ) {
    throw new RoutineStoreError(
      'Routine details are invalid. Check the owner, schedule and checklist.'
    );
  }

  const schedule = isRecord(input.schedule)
    ? input.schedule
    : {};
  const inputSteps = Array.isArray(input.steps)
    ? input.steps
    : [];
  const normalized = {
    title:
      typeof input.title === 'string'
        ? input.title.trim()
        : '',
    ownerProfileId:
      typeof input.ownerProfileId === 'string'
        ? input.ownerProfileId.trim()
        : '',
    active: input.active,
    schedule: {
      daysOfWeek: [
        ...(Array.isArray(schedule.daysOfWeek)
          ? schedule.daysOfWeek
          : []),
      ].sort((left, right) => left - right) as IsoWeekday[],
      startTime:
        schedule.startTime === undefined
          ? null
          : typeof schedule.startTime === 'string' ||
              schedule.startTime === null
            ? schedule.startTime
            : '__invalid__',
      endTime:
        schedule.endTime === undefined
          ? null
          : typeof schedule.endTime === 'string' ||
              schedule.endTime === null
            ? schedule.endTime
            : '__invalid__',
    },
    steps: inputSteps.map(step => ({
      id:
        isRecord(step) &&
        typeof step.id === 'string'
          ? step.id.trim()
          : '',
      title:
        isRecord(step) &&
        typeof step.title === 'string'
          ? step.title.trim()
          : '',
    })),
    reward: input.reward === null || input.reward === undefined
      ? null
      : isRecord(input.reward)
        ? {
          recipientProfileId:
            typeof input.reward.recipientProfileId === 'string'
              ? input.reward.recipientProfileId.trim()
              : '',
          currency: input.reward.currency,
          amount: input.reward.amount,
        }
        : {
          recipientProfileId: '',
          currency: '__invalid__',
          amount: 0,
        },
  };

  const now = new Date().toISOString();
  const candidate = {
    ...normalized,
    id: 'validation-id',
    createdAt: now,
    updatedAt: now,
  };

  if (!isRoutineDefinition(candidate)) {
    throw new RoutineStoreError(
      'Routine details are invalid. Check the owner, schedule and checklist.'
    );
  }

  return normalized as RoutineDefinitionInput;
}

function normalizeTimeZone(
  input: unknown
): string {
  if (
    !isRecord(input) ||
    typeof input.timeZone !== 'string' ||
    !input.timeZone.trim()
  ) {
    throw new RoutineStoreError(
      'Routine materialisation timezone is invalid.'
    );
  }

  const timeZone = input.timeZone.trim();

  try {
    new Intl.DateTimeFormat(
      'en-GB',
      { timeZone }
    ).format(new Date());
  } catch {
    throw new RoutineStoreError(
      'Routine materialisation timezone is invalid.'
    );
  }

  return timeZone;
}

function getZonedDate(
  instant: Date,
  timeZone: string
): {
  localDate: string;
  weekday: IsoWeekday;
} {
  const parts = new Intl.DateTimeFormat(
    'en-GB',
    {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    }
  ).formatToParts(instant);
  const part = (
    type: Intl.DateTimeFormatPartTypes
  ) => parts.find(
    candidate => candidate.type === type
  )?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  const weekday = WEEKDAY_BY_NAME[
    part('weekday') ?? ''
  ];

  if (!year || !month || !day || !weekday) {
    throw new RoutineStoreError(
      'Unable to determine the household routine date.'
    );
  }

  return {
    localDate: `${year}-${month}-${day}`,
    weekday,
  };
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

export class RoutineFileStore {
  private writeQueue: Promise<void> =
    Promise.resolve();

  private readonly filePath: string;
  private readonly accessPolicy: StoreAccessPolicy;

  constructor(
    filePath?: string,
    accessPolicy?: StoreAccessPolicy
  ) {
    const runtime = getRuntimeStoreOptions(
      'routines.local.json'
    );
    this.filePath = filePath ?? runtime.filePath;
    this.accessPolicy = accessPolicy ?? (
      filePath ? 'initialize' : runtime.policy
    );
  }

  get backupPath(): string {
    return `${this.filePath}.bak`;
  }

  private async readExisting(): Promise<
    LoadedStore | null
  > {
    if (this.accessPolicy === 'disabled') {
      throw new RoutineStoreError(
        'The Routine datastore is disabled in Demo mode.'
      );
    }

    let raw: string;

    try {
      raw = await readFile(
        this.filePath,
        'utf8'
      );
    } catch (error) {
      if (
        isRecord(error) &&
        error.code === 'ENOENT'
      ) {
        if (this.accessPolicy === 'required') {
          throw new RoutineStoreError(
            'The required Routine datastore is missing.'
          );
        }
        return null;
      }

      throw error;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new RoutineStoreCorruptError(
        'The local routines store is malformed. It was not changed.'
      );
    }

    if (
      isRecord(parsed) &&
      parsed.schemaVersion === 1
    ) {
      const legacy =
        validateLegacyRoutineStore(parsed);
      const migrated = migrateRoutineStoreV2(
        migrateLegacyRoutineStore(legacy)
      );

      await this.replace(migrated, true);

      return {
        store: migrated,
        migrated: true,
      };
    }

    if (
      isRecord(parsed) &&
      parsed.schemaVersion === 2
    ) {
      const migrated = migrateRoutineStoreV2(
        validateLegacyRoutineStoreV2(parsed)
      );

      await this.replace(migrated, true);

      return {
        store: migrated,
        migrated: true,
      };
    }

    return {
      store: validateRoutineStore(parsed),
      migrated: false,
    };
  }

  async read(): Promise<RoutineStoreData> {
    const existing = await this.readExisting();

    if (existing) {
      return structuredClone(existing.store);
    }

    await this.replace(EMPTY_STORE, false);
    return structuredClone(EMPTY_STORE);
  }

  private async replace(
    nextStore: RoutineStoreData,
    retainBackup: boolean
  ): Promise<void> {
    validateRoutineStore(nextStore);

    if (this.accessPolicy === 'initialize') {
      await mkdir(dirname(this.filePath), {
        recursive: true,
      });
    }

    const temporaryPath =
      `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    const backupTemporaryPath =
      `${this.backupPath}.${process.pid}.${Date.now()}.tmp`;

    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify(nextStore, null, 2)}\n`,
        {
          encoding: 'utf8',
          flag: 'wx',
        }
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

      await rename(
        temporaryPath,
        this.filePath
      );
    } catch (error) {
      try {
        await unlink(temporaryPath);
      } catch {
        // The temporary file may already have been renamed.
      }

      try {
        await unlink(backupTemporaryPath);
      } catch {
        // The backup temporary file may already have been renamed.
      }

      throw error;
    }
  }

  private async mutate<T>(
    update: (
      store: RoutineStoreData
    ) => StoreUpdate<T>
  ): Promise<T> {
    let operationResult: T | undefined;
    let operationError: unknown;

    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          const existing =
            await this.readExisting();
          const current = existing?.store ??
            structuredClone(EMPTY_STORE);
          const updated = update(
            structuredClone(current)
          );

          validateRoutineStore(updated.store);

          if (updated.changed !== false) {
            await this.replace(
              updated.store,
              existing !== null &&
                !existing.migrated
            );
          }

          operationResult = updated.result;
        } catch (error) {
          operationError = error;
        }
      });

    await this.writeQueue;

    if (operationError) {
      throw operationError;
    }

    return operationResult as T;
  }

  async createRoutine(
    id: string,
    input: unknown,
    now = new Date().toISOString()
  ): Promise<RoutineDefinition> {
    const normalized =
      normalizeDefinitionInput(input);

    return this.mutate(store => {
      if (
        store.routines.some(
          routine => routine.id === id
        )
      ) {
        throw new RoutineStoreError(
          'Routine ID already exists.'
        );
      }

      const routine: RoutineDefinition = {
        id,
        ...normalized,
        createdAt: now,
        updatedAt: now,
      };

      return {
        store: {
          ...store,
          routines: [
            ...store.routines,
            routine,
          ],
        },
        result: routine,
      };
    });
  }

  async updateRoutine(
    id: string,
    input: unknown,
    now = new Date().toISOString()
  ): Promise<RoutineDefinition> {
    const normalized =
      normalizeDefinitionInput(input);

    return this.mutate(store => {
      const existing = store.routines.find(
        routine => routine.id === id
      );

      if (!existing) {
        throw new RoutineNotFoundError(
          'Routine was not found.'
        );
      }

      const routine: RoutineDefinition = {
        ...existing,
        ...normalized,
        updatedAt: now,
      };

      return {
        store: {
          ...store,
          routines: store.routines.map(
            candidate =>
              candidate.id === id
                ? routine
                : candidate
          ),
        },
        result: routine,
      };
    });
  }

  async deleteRoutine(
    id: string
  ): Promise<void> {
    return this.mutate(store => {
      if (
        !store.routines.some(
          routine => routine.id === id
        )
      ) {
        throw new RoutineNotFoundError(
          'Routine was not found.'
        );
      }

      return {
        store: {
          ...store,
          routines: store.routines.filter(
            routine => routine.id !== id
          ),
          occurrences:
            store.occurrences.filter(
              occurrence =>
                occurrence.routineId !== id
            ),
        },
        result: undefined,
      };
    });
  }

  async materializeToday(
    input: RoutineMaterializationInput | unknown,
    now = new Date()
  ): Promise<{
    localDate: string;
    materializedCount: number;
  }> {
    const timeZone = normalizeTimeZone(input);
    const { localDate, weekday } =
      getZonedDate(now, timeZone);
    const capturedAt = now.toISOString();

    return this.mutate(store => {
      const existingIds = new Set(
        store.occurrences.map(
          occurrence => occurrence.id
        )
      );
      const newOccurrences = store.routines
        .filter(
          routine =>
            routine.active &&
            routine.schedule.daysOfWeek.includes(
              weekday
            )
        )
        .filter(
          routine =>
            !existingIds.has(
              `${routine.id}@${localDate}`
            )
        )
        .map<RoutineOccurrence>(routine => ({
          id: `${routine.id}@${localDate}`,
          routineId: routine.id,
          localDate,
          timeZone,
          snapshot: createSnapshot(
            routine,
            capturedAt,
            'captured'
          ),
          rewardContract: structuredClone(
            routine.reward
          ),
          completionSequence: 0,
          completedSteps: {},
          completedAt: null,
          updatedAt: capturedAt,
        }));

      return {
        store: newOccurrences.length === 0
          ? store
          : {
            ...store,
            occurrences: [
              ...store.occurrences,
              ...newOccurrences,
            ],
          },
        result: {
          localDate,
          materializedCount:
            newOccurrences.length,
        },
        changed: newOccurrences.length > 0,
      };
    });
  }

  async updateOccurrence(
    routineId: string,
    update: unknown,
    now = new Date().toISOString()
  ): Promise<RoutineOccurrence> {
    if (!isRecord(update)) {
      throw new RoutineStoreError(
        'Routine completion details are invalid.'
      );
    }

    const normalizedUpdate: RoutineOccurrenceUpdate = {
      localDate:
        typeof update.localDate === 'string'
          ? update.localDate
          : '',
      timeZone:
        typeof update.timeZone === 'string'
          ? update.timeZone
          : '',
      stepId:
        typeof update.stepId === 'string'
          ? update.stepId
          : '',
      completed: update.completed === true,
    };

    if (
      !isLocalDate(normalizedUpdate.localDate) ||
      !normalizedUpdate.timeZone.trim() ||
      !normalizedUpdate.stepId.trim() ||
      typeof update.completed !== 'boolean'
    ) {
      throw new RoutineStoreError(
        'Routine completion details are invalid.'
      );
    }

    return this.mutate(store => {
      const routine = store.routines.find(
        candidate => candidate.id === routineId
      );

      if (!routine) {
        throw new RoutineNotFoundError(
          'Routine was not found.'
        );
      }

      const occurrenceId =
        `${routineId}@${normalizedUpdate.localDate}`;
      const existing = store.occurrences.find(
        occurrence =>
          occurrence.id === occurrenceId
      );
      const snapshot =
        existing?.snapshot ??
        createSnapshot(
          routine,
          now,
          'captured'
        );

      if (
        !snapshot.steps.some(
          step => step.id === normalizedUpdate.stepId
        )
      ) {
        throw new RoutineStoreError(
          'Routine step was not found in this occurrence.'
        );
      }

      const wasCompleteBeforeUpdate =
        snapshot.steps.every(
          step => Boolean(
            existing?.completedSteps[step.id]
          )
        );
      const completedSteps = {
        ...(existing?.completedSteps ?? {}),
      };

      if (normalizedUpdate.completed) {
        completedSteps[normalizedUpdate.stepId] = now;
      } else {
        delete completedSteps[normalizedUpdate.stepId];
      }

      const allSnapshotStepsComplete =
        snapshot.steps.every(
          step => Boolean(completedSteps[step.id])
        );

      const occurrence: RoutineOccurrence = {
        id: occurrenceId,
        routineId,
        localDate: normalizedUpdate.localDate,
        timeZone:
          existing?.timeZone ??
          normalizedUpdate.timeZone.trim(),
        snapshot,
        rewardContract:
          existing
            ? existing.rewardContract
            : structuredClone(routine.reward),
        completionSequence:
          (existing?.completionSequence ?? 0) +
          (!wasCompleteBeforeUpdate &&
          allSnapshotStepsComplete
            ? 1
            : 0),
        completedSteps,
        completedAt: allSnapshotStepsComplete
          ? wasCompleteBeforeUpdate
            ? existing?.completedAt ?? now
            : now
          : null,
        updatedAt: now,
      };

      return {
        store: {
          ...store,
          occurrences: [
            ...store.occurrences.filter(
              candidate =>
                candidate.id !== occurrenceId
            ),
            occurrence,
          ],
        },
        result: occurrence,
      };
    });
  }
}

export const routineStore =
  new RoutineFileStore();
