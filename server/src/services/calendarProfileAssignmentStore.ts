import crypto from 'node:crypto';
import { access, copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname } from 'node:path';

import { getRuntimeStoreOptions, type StoreAccessPolicy } from '../config/runtimeData.js';
import type { CalendarSourceConfig } from '../config/householdConfig.js';

export const CALENDAR_EVENT_KEY_PATTERN = /^calendar-event-v1-[a-f0-9]{64}$/;
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_ASSIGNMENTS = 50_000;

export type CalendarAssignmentTarget =
  | { kind: 'family' }
  | { kind: 'members'; profileIds: string[] }
  | { kind: 'unassigned' };

export type CalendarProfileAssignment = {
  eventKey: string;
  target: CalendarAssignmentTarget;
  updatedAt: string;
};

export type CalendarProfileAssignmentStoreData = {
  schemaVersion: 1;
  assignments: CalendarProfileAssignment[];
};

export class CalendarProfileAssignmentStoreError extends Error {}
export class CalendarProfileAssignmentStoreCorruptError extends CalendarProfileAssignmentStoreError {}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
}

export function validateCalendarAssignmentTarget(value: unknown): CalendarAssignmentTarget {
  const target = record(value);
  if (!target || typeof target.kind !== 'string') {
    throw new CalendarProfileAssignmentStoreError('Calendar profile assignment target is invalid.');
  }
  if (target.kind === 'family' || target.kind === 'unassigned') {
    if (!exact(target, ['kind'])) throw new CalendarProfileAssignmentStoreError('Calendar profile assignment target is invalid.');
    return { kind: target.kind };
  }
  if (target.kind !== 'members' || !exact(target, ['kind', 'profileIds']) || !Array.isArray(target.profileIds) || target.profileIds.length < 1 || target.profileIds.length > 20) {
    throw new CalendarProfileAssignmentStoreError('Calendar profile assignment target is invalid.');
  }
  const profileIds = target.profileIds.map(value => {
    if (typeof value !== 'string' || !value || value.length > 80 || value.trim() !== value || value === 'family') {
      throw new CalendarProfileAssignmentStoreError('Calendar profile assignment member is invalid.');
    }
    return value;
  });
  if (new Set(profileIds).size !== profileIds.length) {
    throw new CalendarProfileAssignmentStoreError('Calendar profile assignment members must be unique.');
  }
  return { kind: 'members', profileIds };
}

export function validateCalendarProfileAssignmentStore(value: unknown): CalendarProfileAssignmentStoreData {
  const root = record(value);
  if (!root || !exact(root, ['schemaVersion', 'assignments']) || root.schemaVersion !== 1 || !Array.isArray(root.assignments) || root.assignments.length > MAX_ASSIGNMENTS) {
    throw new CalendarProfileAssignmentStoreCorruptError('The Calendar profile assignment store is malformed or unsupported.');
  }
  const seen = new Set<string>();
  let previous = '';
  const assignments = root.assignments.map((entryValue, index) => {
    const entry = record(entryValue);
    if (!entry || !exact(entry, ['eventKey', 'target', 'updatedAt']) || typeof entry.eventKey !== 'string' || !CALENDAR_EVENT_KEY_PATTERN.test(entry.eventKey) || typeof entry.updatedAt !== 'string' || !RFC3339_PATTERN.test(entry.updatedAt) || Number.isNaN(Date.parse(entry.updatedAt))) {
      throw new CalendarProfileAssignmentStoreCorruptError(`Calendar profile assignment ${index} is invalid.`);
    }
    if (seen.has(entry.eventKey) || (previous && previous.localeCompare(entry.eventKey, 'en') >= 0)) {
      throw new CalendarProfileAssignmentStoreCorruptError('Calendar profile assignments must have unique, deterministic event-key order.');
    }
    seen.add(entry.eventKey);
    previous = entry.eventKey;
    try {
      return { eventKey: entry.eventKey, target: validateCalendarAssignmentTarget(entry.target), updatedAt: entry.updatedAt };
    } catch (error) {
      throw new CalendarProfileAssignmentStoreCorruptError(`Calendar profile assignment ${index} is invalid.`, { cause: error });
    }
  });
  return { schemaVersion: 1, assignments };
}

export const EMPTY_CALENDAR_PROFILE_ASSIGNMENT_STORE: CalendarProfileAssignmentStoreData = {
  schemaVersion: 1,
  assignments: [],
};

async function exists(path: string): Promise<boolean> {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

export class CalendarProfileAssignmentFileStore {
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly filePath: string;
  private readonly accessPolicy: StoreAccessPolicy;

  constructor(filePath?: string, accessPolicy?: StoreAccessPolicy) {
    const runtime = getRuntimeStoreOptions('calendar-profile-assignments.local.json');
    this.filePath = filePath ?? runtime.filePath;
    this.accessPolicy = accessPolicy ?? (filePath ? 'initialize' : runtime.policy);
  }

  get backupPath(): string { return `${this.filePath}.bak`; }

  private async readExisting(): Promise<CalendarProfileAssignmentStoreData | null> {
    if (this.accessPolicy === 'disabled') throw new CalendarProfileAssignmentStoreError('Calendar profile assignments are disabled in Demo mode.');
    try {
      return validateCalendarProfileAssignmentStore(JSON.parse(await readFile(this.filePath, 'utf8')) as unknown);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        if (this.accessPolicy === 'required') throw new CalendarProfileAssignmentStoreError('The required Calendar profile assignment store is missing.');
        return null;
      }
      if (error instanceof CalendarProfileAssignmentStoreCorruptError) throw error;
      throw new CalendarProfileAssignmentStoreCorruptError('The Calendar profile assignment store is malformed. It was not changed.', { cause: error });
    }
  }

  private async replace(store: CalendarProfileAssignmentStoreData, retainBackup: boolean): Promise<void> {
    validateCalendarProfileAssignmentStore(store);
    if (this.accessPolicy === 'initialize') await mkdir(dirname(this.filePath), { recursive: true });
    const suffix = `${process.pid}.${Date.now()}.${crypto.randomUUID()}`;
    const temporary = `${this.filePath}.${suffix}.tmp`;
    const backupTemporary = `${this.backupPath}.${suffix}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      if (retainBackup && await exists(this.filePath)) {
        await copyFile(this.filePath, backupTemporary);
        await rename(backupTemporary, this.backupPath);
      }
      await rename(temporary, this.filePath);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      await unlink(backupTemporary).catch(() => undefined);
      throw error;
    }
  }

  private async mutate<T>(change: (store: CalendarProfileAssignmentStoreData) => { store: CalendarProfileAssignmentStoreData; result: T; changed: boolean }): Promise<T> {
    let result: T | undefined;
    let failure: unknown;
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      try {
        const existing = await this.readExisting();
        const update = change(structuredClone(existing ?? EMPTY_CALENDAR_PROFILE_ASSIGNMENT_STORE));
        validateCalendarProfileAssignmentStore(update.store);
        if (update.changed || existing === null) await this.replace(update.store, existing !== null);
        result = update.result;
      } catch (error) { failure = error; }
    });
    await this.writeQueue;
    if (failure) throw failure;
    return result as T;
  }

  read(): Promise<CalendarProfileAssignmentStoreData> {
    return this.mutate(store => ({ store, result: structuredClone(store), changed: false }));
  }

  set(eventKey: string, targetValue: unknown, configuredMemberOrder: readonly string[], now = new Date()): Promise<CalendarProfileAssignment> {
    if (!CALENDAR_EVENT_KEY_PATTERN.test(eventKey)) throw new CalendarProfileAssignmentStoreError('Calendar event key is invalid or unsupported.');
    const target = validateCalendarAssignmentTarget(targetValue);
    const memberSet = new Set(configuredMemberOrder);
    const normalizedTarget = target.kind === 'members'
      ? { kind: 'members' as const, profileIds: [...target.profileIds].sort((a, b) => configuredMemberOrder.indexOf(a) - configuredMemberOrder.indexOf(b)) }
      : target;
    if (normalizedTarget.kind === 'members' && normalizedTarget.profileIds.some(id => !memberSet.has(id))) {
      throw new CalendarProfileAssignmentStoreError('Calendar profile assignment references an unknown Household member.');
    }
    return this.mutate(store => {
      const assignment = { eventKey, target: normalizedTarget, updatedAt: now.toISOString() };
      const assignments = store.assignments.filter(item => item.eventKey !== eventKey);
      assignments.push(assignment);
      assignments.sort((a, b) => a.eventKey.localeCompare(b.eventKey, 'en'));
      return { store: { schemaVersion: 1, assignments }, result: assignment, changed: true };
    });
  }

  remove(eventKey: string): Promise<boolean> {
    if (!CALENDAR_EVENT_KEY_PATTERN.test(eventKey)) throw new CalendarProfileAssignmentStoreError('Calendar event key is invalid or unsupported.');
    return this.mutate(store => {
      const assignments = store.assignments.filter(item => item.eventKey !== eventKey);
      return { store: { schemaVersion: 1, assignments }, result: assignments.length !== store.assignments.length, changed: assignments.length !== store.assignments.length };
    });
  }
}

export const calendarProfileAssignmentStore = new CalendarProfileAssignmentFileStore();

export function resolveCalendarProfileAssignment(
  eventKey: string,
  sourceId: string,
  assignments: readonly CalendarProfileAssignment[],
  sources: readonly CalendarSourceConfig[],
) {
  const explicit = assignments.find(item => item.eventKey === eventKey);
  if (explicit) return { target: explicit.target, basis: 'explicit' as const };
  const sourceDefault = sources.find(source => source.sourceId === sourceId)?.defaultProfileAssignment;
  if (sourceDefault) return { target: sourceDefault, basis: 'source-default' as const };
  return { target: { kind: 'unassigned' as const }, basis: 'none' as const };
}
