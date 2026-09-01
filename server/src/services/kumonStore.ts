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
  CreateKumonAssignmentInput,
  KumonAssignment,
  KumonStoreData,
  KumonSubject,
  UpdateKumonAssignmentInput,
  UpdateKumonProgressInput,
} from '../types/kumon.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_PROFILE_ID_LENGTH = 120;
const MAX_LABEL_LENGTH = 120;

type StoreUpdate<T> = {
  store: KumonStoreData;
  result: T;
  changed?: boolean;
};

export type KumonMutationResult = {
  assignment: KumonAssignment;
  created?: boolean;
};

export class KumonStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KumonStoreError';
  }
}

export class KumonStoreCorruptError extends KumonStoreError {
  constructor(message: string) {
    super(message);
    this.name = 'KumonStoreCorruptError';
  }
}

export class KumonNotFoundError extends KumonStoreError {
  constructor(message: string) {
    super(message);
    this.name = 'KumonNotFoundError';
  }
}

export class KumonConflictError extends KumonStoreError {
  constructor(message: string) {
    super(message);
    this.name = 'KumonConflictError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}

function isCanonicalUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isKumonLocalDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1000 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) && value === new Date(parsed).toISOString();
}

function isNormalizedText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' &&
    Boolean(value) &&
    value === value.trim() &&
    value.length <= maxLength;
}

function isSubject(value: unknown): value is KumonSubject {
  return value === 'maths' || value === 'english';
}

function isAssignment(value: unknown): value is KumonAssignment {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'id', 'localDate', 'childProfileId', 'subject', 'assignmentLabel',
      'totalUnits', 'completedUnits', 'completedAt', 'createdAt', 'updatedAt',
    ]) ||
    Object.keys(value).length !== 10 ||
    !isCanonicalUuid(value.id) ||
    !isKumonLocalDate(value.localDate) ||
    !isNormalizedText(value.childProfileId, MAX_PROFILE_ID_LENGTH) ||
    value.childProfileId === 'family' ||
    !isSubject(value.subject) ||
    !isNormalizedText(value.assignmentLabel, MAX_LABEL_LENGTH) ||
    !Number.isSafeInteger(value.totalUnits) ||
    Number(value.totalUnits) < 1 ||
    Number(value.totalUnits) > 100 ||
    !Number.isSafeInteger(value.completedUnits) ||
    Number(value.completedUnits) < 0 ||
    Number(value.completedUnits) > Number(value.totalUnits) ||
    (value.completedAt !== null && !isIsoTimestamp(value.completedAt)) ||
    !isIsoTimestamp(value.createdAt) ||
    !isIsoTimestamp(value.updatedAt)
  ) return false;

  const complete = value.completedUnits === value.totalUnits;
  return (complete === (value.completedAt !== null)) &&
    Date.parse(value.updatedAt) >= Date.parse(value.createdAt) &&
    (value.completedAt === null || Date.parse(value.completedAt) >= Date.parse(value.createdAt));
}

export function validateKumonStore(value: unknown): KumonStoreData {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['schemaVersion', 'assignments']) ||
    Object.keys(value).length !== 2 ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.assignments) ||
    !value.assignments.every(isAssignment)
  ) {
    throw new KumonStoreCorruptError(
      'The local Kumon store is malformed or has an unsupported schema. It was not changed.'
    );
  }

  const assignments = value.assignments as KumonAssignment[];
  const ids = assignments.map(assignment => assignment.id);
  const ownershipKeys = assignments.map(assignment =>
    `${assignment.localDate}\u0000${assignment.childProfileId}\u0000${assignment.subject}`
  );
  if (
    new Set(ids).size !== ids.length ||
    new Set(ownershipKeys).size !== ownershipKeys.length
  ) {
    throw new KumonStoreCorruptError(
      'The local Kumon store violates assignment identity invariants. It was not changed.'
    );
  }
  return value as KumonStoreData;
}

export function getKumonLocalDate(instant: Date, timeZone: string): string {
  if (typeof timeZone !== 'string' || !timeZone.trim()) {
    throw new KumonStoreError('Kumon timezone is invalid.');
  }
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone.trim(), year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(instant);
  } catch {
    throw new KumonStoreError('Kumon timezone is invalid.');
  }
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(candidate => candidate.type === type)?.value;
  const localDate = `${part('year')}-${part('month')}-${part('day')}`;
  if (!isKumonLocalDate(localDate)) {
    throw new KumonStoreError('Unable to determine the Household Kumon date.');
  }
  return localDate;
}

export function shiftKumonLocalDate(localDate: string, days: number): string {
  if (!isKumonLocalDate(localDate) || !Number.isInteger(days)) {
    throw new KumonStoreError('Kumon date range is invalid.');
  }
  const [year, month, day] = localDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    String(shifted.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function normalizeText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw new KumonStoreError(`${field} is required.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new KumonStoreError(`${field} must be from 1 to ${maxLength} characters.`);
  }
  return normalized;
}

function normalizeUnits(value: unknown, field: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > 100) {
    throw new KumonStoreError(`${field} must be a whole number from ${minimum} to 100.`);
  }
  return Number(value);
}

function normalizeSubject(value: unknown): KumonSubject {
  if (!isSubject(value)) throw new KumonStoreError('Kumon subject must be maths or english.');
  return value;
}

function normalizeCreateInput(value: unknown): CreateKumonAssignmentInput {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'childProfileId', 'subject', 'assignmentLabel', 'totalUnits', 'timeZone',
  ])) throw new KumonStoreError('Kumon assignment details are invalid.');
  const childProfileId = normalizeText(value.childProfileId, 'Child profile ID', MAX_PROFILE_ID_LENGTH);
  if (childProfileId === 'family') throw new KumonStoreError('Family cannot own a Kumon assignment.');
  return {
    childProfileId,
    subject: normalizeSubject(value.subject),
    assignmentLabel: normalizeText(value.assignmentLabel, 'Assignment label', MAX_LABEL_LENGTH),
    totalUnits: normalizeUnits(value.totalUnits, 'Total units', 1),
    timeZone: normalizeText(value.timeZone, 'Kumon timezone', 120),
  };
}

function normalizeUpdateInput(value: unknown): UpdateKumonAssignmentInput {
  if (!isRecord(value) || !hasOnlyKeys(value, ['assignmentLabel', 'totalUnits', 'timeZone'])) {
    throw new KumonStoreError('Kumon assignment changes are invalid.');
  }
  return {
    assignmentLabel: normalizeText(value.assignmentLabel, 'Assignment label', MAX_LABEL_LENGTH),
    totalUnits: normalizeUnits(value.totalUnits, 'Total units', 1),
    timeZone: normalizeText(value.timeZone, 'Kumon timezone', 120),
  };
}

function normalizeProgressInput(value: unknown): UpdateKumonProgressInput {
  if (!isRecord(value) || !hasOnlyKeys(value, ['completedUnits', 'timeZone'])) {
    throw new KumonStoreError('Kumon progress is invalid.');
  }
  return {
    completedUnits: normalizeUnits(value.completedUnits, 'Completed units', 0),
    timeZone: normalizeText(value.timeZone, 'Kumon timezone', 120),
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

const EMPTY_STORE: KumonStoreData = { schemaVersion: 1, assignments: [] };

export class KumonFileStore {
  private writeQueue: Promise<void> = Promise.resolve();

  private readonly filePath: string;
  private readonly accessPolicy: StoreAccessPolicy;

  constructor(
    filePath?: string,
    accessPolicy?: StoreAccessPolicy
  ) {
    const runtime = getRuntimeStoreOptions(
      'kumon.local.json'
    );
    this.filePath = filePath ?? runtime.filePath;
    this.accessPolicy = accessPolicy ?? (
      filePath ? 'initialize' : runtime.policy
    );
  }

  get backupPath(): string {
    return `${this.filePath}.bak`;
  }

  private async readExisting(): Promise<KumonStoreData | null> {
    if (this.accessPolicy === 'disabled') {
      throw new KumonStoreError(
        'The Kumon datastore is disabled in Demo mode.'
      );
    }

    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        if (this.accessPolicy === 'required') {
          throw new KumonStoreError(
            'The required Kumon datastore is missing.'
          );
        }
        return null;
      }
      throw error;
    }
    try {
      return validateKumonStore(JSON.parse(raw) as unknown);
    } catch (error) {
      if (error instanceof KumonStoreCorruptError) throw error;
      throw new KumonStoreCorruptError(
        'The local Kumon store is malformed or has an unsupported schema. It was not changed.'
      );
    }
  }

  private async replace(nextStore: KumonStoreData, retainBackup: boolean): Promise<void> {
    validateKumonStore(nextStore);
    if (this.accessPolicy === 'initialize') {
      await mkdir(dirname(this.filePath), { recursive: true });
    }
    const suffix = `${process.pid}.${Date.now()}.${crypto.randomUUID()}`;
    const temporaryPath = `${this.filePath}.${suffix}.tmp`;
    const backupTemporaryPath = `${this.backupPath}.${suffix}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(nextStore, null, 2)}\n`, {
        encoding: 'utf8', flag: 'wx',
      });
      if (retainBackup && await fileExists(this.filePath)) {
        await copyFile(this.filePath, backupTemporaryPath);
        await rename(backupTemporaryPath, this.backupPath);
      }
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      await unlink(backupTemporaryPath).catch(() => undefined);
      throw error;
    }
  }

  private async mutate<T>(update: (store: KumonStoreData) => StoreUpdate<T>): Promise<T> {
    let result: T | undefined;
    let operationError: unknown;
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      try {
        const existing = await this.readExisting();
        const current = structuredClone(existing ?? EMPTY_STORE);
        const updated = update(current);
        validateKumonStore(updated.store);
        if (updated.changed !== false || existing === null) {
          await this.replace(updated.store, existing !== null);
        }
        result = updated.result;
      } catch (error) {
        operationError = error;
      }
    });
    await this.writeQueue;
    if (operationError) throw operationError;
    return result as T;
  }

  async read(): Promise<KumonStoreData> {
    return this.mutate(store => ({ store, result: structuredClone(store), changed: false }));
  }

  async readRange(from: string, to: string): Promise<KumonAssignment[]> {
    if (!isKumonLocalDate(from) || !isKumonLocalDate(to) || from > to) {
      throw new KumonStoreError('Kumon date range is invalid.');
    }
    const store = await this.read();
    return store.assignments
      .filter(assignment => assignment.localDate >= from && assignment.localDate <= to)
      .sort((left, right) =>
        right.localDate.localeCompare(left.localDate) ||
        left.childProfileId.localeCompare(right.childProfileId) ||
        left.subject.localeCompare(right.subject)
      );
  }

  async createAssignment(id: string, value: unknown, now = new Date()): Promise<KumonMutationResult> {
    if (!isCanonicalUuid(id)) throw new KumonStoreError('Kumon assignment ID is invalid.');
    const input = normalizeCreateInput(value);
    const localDate = getKumonLocalDate(now, input.timeZone);
    return this.mutate(store => {
      const existing = store.assignments.find(assignment =>
        assignment.localDate === localDate &&
        assignment.childProfileId === input.childProfileId &&
        assignment.subject === input.subject
      );
      if (existing) throw new KumonConflictError('That child already has this Kumon subject assigned today.');
      const timestamp = now.toISOString();
      const assignment: KumonAssignment = {
        id, localDate, childProfileId: input.childProfileId, subject: input.subject,
        assignmentLabel: input.assignmentLabel, totalUnits: input.totalUnits,
        completedUnits: 0, completedAt: null, createdAt: timestamp, updatedAt: timestamp,
      };
      store.assignments.push(assignment);
      return { store, result: { assignment: structuredClone(assignment), created: true } };
    });
  }

  async updateAssignment(id: string, value: unknown, now = new Date()): Promise<KumonAssignment> {
    if (!isCanonicalUuid(id)) throw new KumonStoreError('Kumon assignment ID is invalid.');
    const input = normalizeUpdateInput(value);
    const today = getKumonLocalDate(now, input.timeZone);
    return this.mutate(store => {
      const assignment = store.assignments.find(candidate => candidate.id === id);
      if (!assignment) throw new KumonNotFoundError('Kumon assignment was not found.');
      if (assignment.localDate !== today) throw new KumonStoreError('Historical Kumon assignments are read-only.');
      if (assignment.completedUnits !== 0) throw new KumonStoreError('Assignment details cannot change after progress has started.');
      if (input.totalUnits < assignment.completedUnits) throw new KumonStoreError('Total units cannot be below completed progress.');
      const changed = assignment.assignmentLabel !== input.assignmentLabel || assignment.totalUnits !== input.totalUnits;
      if (changed) {
        assignment.assignmentLabel = input.assignmentLabel;
        assignment.totalUnits = input.totalUnits;
        assignment.updatedAt = now.toISOString();
      }
      return { store, result: structuredClone(assignment), changed };
    });
  }

  async setProgress(id: string, value: unknown, now = new Date()): Promise<KumonAssignment> {
    if (!isCanonicalUuid(id)) throw new KumonStoreError('Kumon assignment ID is invalid.');
    const input = normalizeProgressInput(value);
    const today = getKumonLocalDate(now, input.timeZone);
    return this.mutate(store => {
      const assignment = store.assignments.find(candidate => candidate.id === id);
      if (!assignment) throw new KumonNotFoundError('Kumon assignment was not found.');
      if (assignment.localDate !== today) throw new KumonStoreError('Historical Kumon assignments are read-only.');
      if (input.completedUnits > assignment.totalUnits) {
        throw new KumonStoreError('Completed units cannot exceed total units.');
      }
      if (input.completedUnits === assignment.completedUnits) {
        return { store, result: structuredClone(assignment), changed: false };
      }
      assignment.completedUnits = input.completedUnits;
      assignment.completedAt = input.completedUnits === assignment.totalUnits
        ? now.toISOString()
        : null;
      assignment.updatedAt = now.toISOString();
      return { store, result: structuredClone(assignment) };
    });
  }

  async deleteAssignment(id: string, timeZone: unknown, now = new Date()): Promise<void> {
    if (!isCanonicalUuid(id)) throw new KumonStoreError('Kumon assignment ID is invalid.');
    const normalizedTimeZone = normalizeText(timeZone, 'Kumon timezone', 120);
    const today = getKumonLocalDate(now, normalizedTimeZone);
    await this.mutate(store => {
      const index = store.assignments.findIndex(candidate => candidate.id === id);
      if (index < 0) throw new KumonNotFoundError('Kumon assignment was not found.');
      const assignment = store.assignments[index];
      if (assignment.localDate !== today) throw new KumonStoreError('Historical Kumon assignments are read-only.');
      if (assignment.completedUnits !== 0) throw new KumonStoreError('A Kumon assignment cannot be deleted after progress has started.');
      store.assignments.splice(index, 1);
      return { store, result: undefined };
    });
  }
}

export const kumonStore = new KumonFileStore();
