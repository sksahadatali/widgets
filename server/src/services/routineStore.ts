import {
  constants,
} from 'node:fs';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import {
  dirname,
} from 'node:path';
import {
  fileURLToPath,
} from 'node:url';

import type {
  IsoWeekday,
  RoutineDefinition,
  RoutineDefinitionInput,
  RoutineOccurrence,
  RoutineOccurrenceUpdate,
  RoutineStoreData,
} from '../types/routine.js';

const DEFAULT_STORE_PATH =
  fileURLToPath(
    new URL(
      '../../data/routines.local.json',
      import.meta.url
    )
  );

const EMPTY_STORE: RoutineStoreData = {
  schemaVersion: 1,
  routines: [],
  occurrences: [],
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isLocalDate(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !DATE_PATTERN.test(value)
  ) {
    return false;
  }

  const [year, month, day] =
    value.split('-').map(Number);
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

function isRoutineDefinition(
  value: unknown
): value is RoutineDefinition {
  if (!isRecord(value)) {
    return false;
  }

  const schedule = value.schedule;
  const steps = value.steps;

  if (
    typeof value.id !== 'string' ||
    !value.id.trim() ||
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    typeof value.ownerProfileId !== 'string' ||
    !value.ownerProfileId.trim() ||
    typeof value.active !== 'boolean' ||
    !isRecord(schedule) ||
    !Array.isArray(schedule.daysOfWeek) ||
    schedule.daysOfWeek.length === 0 ||
    !schedule.daysOfWeek.every(
      day =>
        Number.isInteger(day) &&
        day >= 1 &&
        day <= 7
    ) ||
    new Set(schedule.daysOfWeek).size !==
      schedule.daysOfWeek.length ||
    !isTimeOrNull(schedule.startTime) ||
    !isTimeOrNull(schedule.endTime) ||
    (
      schedule.endTime !== null &&
      (
        schedule.startTime === null ||
        schedule.endTime <= schedule.startTime
      )
    ) ||
    !Array.isArray(steps) ||
    steps.length === 0 ||
    !steps.every(
      step =>
        isRecord(step) &&
        typeof step.id === 'string' &&
        Boolean(step.id.trim()) &&
        typeof step.title === 'string' &&
        Boolean(step.title.trim())
    ) ||
    new Set(
      steps.map(step =>
        isRecord(step)
          ? step.id
          : undefined
      )
    ).size !== steps.length ||
    !isIsoTimestamp(value.createdAt) ||
    !isIsoTimestamp(value.updatedAt)
  ) {
    return false;
  }

  return true;
}

function isRoutineOccurrence(
  value: unknown
): value is RoutineOccurrence {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.routineId !== 'string' ||
    !value.routineId.trim() ||
    !isLocalDate(value.localDate) ||
    value.id !==
      `${value.routineId}@${value.localDate}` ||
    typeof value.timeZone !== 'string' ||
    !value.timeZone.trim() ||
    !isRecord(value.completedSteps) ||
    !Object.entries(value.completedSteps).every(
      ([stepId, completedAt]) =>
        Boolean(stepId.trim()) &&
        isIsoTimestamp(completedAt)
    ) ||
    !(
      value.completedAt === null ||
      isIsoTimestamp(value.completedAt)
    ) ||
    !isIsoTimestamp(value.updatedAt)
  ) {
    return false;
  }

  return true;
}

export function validateRoutineStore(
  value: unknown
): RoutineStoreData {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.routines) ||
    !value.routines.every(isRoutineDefinition) ||
    !Array.isArray(value.occurrences) ||
    !value.occurrences.every(isRoutineOccurrence)
  ) {
    throw new RoutineStoreCorruptError(
      'The local routines store is malformed. It was not changed.'
    );
  }

  const routineIds = value.routines.map(
    routine => routine.id
  );
  const occurrenceIds = value.occurrences.map(
    occurrence => occurrence.id
  );

  if (
    new Set(routineIds).size !== routineIds.length ||
    new Set(occurrenceIds).size !== occurrenceIds.length
  ) {
    throw new RoutineStoreCorruptError(
      'The local routines store contains duplicate IDs. It was not changed.'
    );
  }

  return value as RoutineStoreData;
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
  };

  const now = new Date().toISOString();
  const candidate: RoutineDefinition = {
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

  return normalized;
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

  constructor(
    private readonly filePath =
      DEFAULT_STORE_PATH
  ) {}

  get backupPath(): string {
    return `${this.filePath}.bak`;
  }

  private async readExisting(): Promise<
    RoutineStoreData | null
  > {
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
        return null;
      }

      throw error;
    }

    try {
      return validateRoutineStore(
        JSON.parse(raw) as unknown
      );
    } catch (error) {
      if (error instanceof RoutineStoreCorruptError) {
        throw error;
      }

      throw new RoutineStoreCorruptError(
        'The local routines store is malformed. It was not changed.'
      );
    }
  }

  async read(): Promise<RoutineStoreData> {
    const existing = await this.readExisting();

    if (existing) {
      return existing;
    }

    await this.replace(EMPTY_STORE, false);
    return structuredClone(EMPTY_STORE);
  }

  private async replace(
    nextStore: RoutineStoreData,
    retainBackup: boolean
  ): Promise<void> {
    validateRoutineStore(nextStore);

    await mkdir(dirname(this.filePath), {
      recursive: true,
    });

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
    ) => { store: RoutineStoreData; result: T }
  ): Promise<T> {
    let operationResult: T | undefined;
    let operationError: unknown;

    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          const existing =
            await this.readExisting();
          const current = existing ??
            structuredClone(EMPTY_STORE);
          const updated = update(
            structuredClone(current)
          );

          validateRoutineStore(updated.store);

          await this.replace(
            updated.store,
            existing !== null
          );

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

      if (
        !routine.steps.some(
          step => step.id === update.stepId
        )
      ) {
        throw new RoutineStoreError(
          'Routine step was not found.'
        );
      }

      const occurrenceId =
        `${routineId}@${normalizedUpdate.localDate}`;
      const existing = store.occurrences.find(
        occurrence =>
          occurrence.id === occurrenceId
      );
      const wasCompleteBeforeUpdate =
        routine.steps.every(
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

      const allCurrentStepsComplete =
        routine.steps.every(
          step => Boolean(completedSteps[step.id])
        );

      const occurrence: RoutineOccurrence = {
        id: occurrenceId,
        routineId,
        localDate: normalizedUpdate.localDate,
        timeZone: normalizedUpdate.timeZone.trim(),
        completedSteps,
        completedAt: allCurrentStepsComplete
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
