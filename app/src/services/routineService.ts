import exampleStore from '../data/routines.example.json';
import type {
  RoutineData,
  RoutineDefinition,
  RoutineDefinitionInput,
  RoutineOccurrence,
} from '../types/routine';
import {
  createRoutineSnapshot,
  type DemoRoutineStore,
  type LegacyDemoStore,
  materializeDemoRoutines,
  migrateLegacyDemoStore,
} from '../routines/demoRoutineStore';
import {
  getAppMode,
} from './householdConfigService';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:3001';
const DEMO_STORAGE_KEY =
  'ey-os-demo-routines-v2';
const LEGACY_DEMO_STORAGE_KEY =
  'ey-os-demo-routines-v1';
const REQUEST_TIMEOUT_MS = 15000;

type RoutineApiResponse =
  | {
    success: true;
    routines: RoutineDefinition[];
    occurrences: RoutineOccurrence[];
  }
  | {
    success: true;
    routine: RoutineDefinition;
  }
  | {
    success: true;
    occurrence: RoutineOccurrence;
  }
  | {
    success: true;
    localDate: string;
    materializedCount: number;
  }
  | {
    success: true;
  }
  | {
    success: false;
    error: string;
  };

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isRoutineDefinition(
  value: unknown
): value is RoutineDefinition {
  if (!isRecord(value) || !isRecord(value.schedule)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    Boolean(value.id) &&
    typeof value.title === 'string' &&
    typeof value.ownerProfileId === 'string' &&
    typeof value.active === 'boolean' &&
    Array.isArray(value.schedule.daysOfWeek) &&
    value.schedule.daysOfWeek.every(day =>
      Number.isInteger(day) && day >= 1 && day <= 7
    ) &&
    Array.isArray(value.steps) &&
    value.steps.length > 0 &&
    value.steps.every(step =>
      isRecord(step) &&
      typeof step.id === 'string' &&
      Boolean(step.id) &&
      typeof step.title === 'string'
    ) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

function isRoutineOccurrence(
  value: unknown
): value is RoutineOccurrence {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.routineId === 'string' &&
    typeof value.localDate === 'string' &&
    typeof value.timeZone === 'string' &&
    isRecord(value.snapshot) &&
    typeof value.snapshot.title === 'string' &&
    typeof value.snapshot.ownerProfileId === 'string' &&
    isRecord(value.snapshot.schedule) &&
    Array.isArray(
      value.snapshot.schedule.daysOfWeek
    ) &&
    Array.isArray(value.snapshot.steps) &&
    value.snapshot.steps.length > 0 &&
    value.snapshot.steps.every(step =>
      isRecord(step) &&
      typeof step.id === 'string' &&
      Boolean(step.id) &&
      typeof step.title === 'string'
    ) &&
    typeof value.snapshot.definitionUpdatedAt ===
      'string' &&
    typeof value.snapshot.capturedAt === 'string' &&
    (
      value.snapshot.source === 'captured' ||
      value.snapshot.source === 'legacy-migration'
    ) &&
    isRecord(value.completedSteps) &&
    Object.values(value.completedSteps).every(
      completedAt =>
        typeof completedAt === 'string'
    ) &&
    (
      value.completedAt === null ||
      typeof value.completedAt === 'string'
    ) &&
    typeof value.updatedAt === 'string'
  );
}

function isRoutineData(
  value: unknown
): value is RoutineData {
  return (
    isRecord(value) &&
    value.schemaVersion === 2 &&
    Array.isArray(value.routines) &&
    value.routines.every(isRoutineDefinition) &&
    Array.isArray(value.occurrences) &&
    value.occurrences.every(isRoutineOccurrence)
  );
}

function isLegacyDemoStore(
  value: unknown
): value is LegacyDemoStore {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.routines) ||
    !value.routines.every(isRoutineDefinition) ||
    !Array.isArray(value.occurrences)
  ) {
    return false;
  }

  return value.occurrences.every(occurrence =>
    isRecord(occurrence) &&
    typeof occurrence.id === 'string' &&
    typeof occurrence.routineId === 'string' &&
    typeof occurrence.localDate === 'string' &&
    typeof occurrence.timeZone === 'string' &&
    isRecord(occurrence.completedSteps) &&
    (
      occurrence.completedAt === null ||
      typeof occurrence.completedAt === 'string'
    ) &&
    typeof occurrence.updatedAt === 'string'
  );
}

function cloneExampleData(): DemoRoutineStore {
  return structuredClone(
    exampleStore as DemoRoutineStore
  );
}

function readDemoData(): DemoRoutineStore {
  const stored = window.localStorage.getItem(
    DEMO_STORAGE_KEY
  );

  if (stored) {
    try {
      const parsed = JSON.parse(stored) as unknown;

      if (!isRoutineData(parsed)) {
        throw new Error('Invalid demo data');
      }

      return parsed as DemoRoutineStore;
    } catch {
      throw new Error(
        'Demo routine data is invalid. Clear this site\'s local storage to restore the safe examples.'
      );
    }
  }

  const legacyStored = window.localStorage.getItem(
    LEGACY_DEMO_STORAGE_KEY
  );

  if (!legacyStored) {
    return cloneExampleData();
  }

  try {
    const parsed = JSON.parse(legacyStored) as unknown;

    if (!isLegacyDemoStore(parsed)) {
      throw new Error('Invalid legacy demo data');
    }

    const migrated = migrateLegacyDemoStore(parsed);
    writeDemoData(migrated);
    return migrated;
  } catch {
    throw new Error(
      'Demo routine data is invalid. Clear this site\'s local storage to restore the safe examples.'
    );
  }
}

function writeDemoData(data: DemoRoutineStore): void {
  window.localStorage.setItem(
    DEMO_STORAGE_KEY,
    JSON.stringify(data)
  );
}

async function requestHousehold(
  path: string,
  options: RequestInit = {}
): Promise<RoutineApiResponse> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      `${API_BASE_URL}${path}`,
      {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        cache: 'no-store',
        signal: controller.signal,
      }
    );
    const body =
      await response.json() as RoutineApiResponse;

    if (!response.ok || !body.success) {
      throw new Error(
        !body.success
          ? body.error
          : `Routine request failed (${response.status}).`
      );
    }

    return body;
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === 'AbortError'
    ) {
      throw new Error(
        'The household routines service did not respond.',
        { cause: error }
      );
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function materializeTodayRoutines(
  timeZone: string,
  now = new Date()
): Promise<string> {
  if (getAppMode() === 'demo') {
    const data = readDemoData();
    const materialized = materializeDemoRoutines(
      data,
      timeZone,
      now
    );

    if (materialized.materializedCount > 0) {
      writeDemoData(materialized.store);
    }

    return materialized.localDate;
  }

  const response = await requestHousehold(
    '/api/routines/occurrences/today',
    {
      method: 'POST',
      body: JSON.stringify({ timeZone }),
    }
  );

  if (!('localDate' in response)) {
    throw new Error(
      'The household routines service returned an invalid materialisation response.'
    );
  }

  return response.localDate;
}

export async function loadRoutines(
  localDate: string
): Promise<RoutineData> {
  if (getAppMode() === 'demo') {
    const data = readDemoData();

    return {
      routines: data.routines,
      occurrences: data.occurrences.filter(
        occurrence =>
          occurrence.localDate === localDate
      ),
    };
  }

  const response =
    await requestHousehold(
      `/api/routines?localDate=${encodeURIComponent(localDate)}`
    );

  if (
    !('routines' in response) ||
    !('occurrences' in response)
  ) {
    throw new Error(
      'The household routines service returned an invalid response.'
    );
  }

  return {
    routines: response.routines,
    occurrences: response.occurrences,
  };
}

export async function loadRoutineHistory(): Promise<
  RoutineOccurrence[]
> {
  if (getAppMode() === 'demo') {
    return structuredClone(
      readDemoData().occurrences
    );
  }

  const response =
    await requestHousehold('/api/routines');

  if (!('occurrences' in response)) {
    throw new Error(
      'The household routines service returned an invalid history response.'
    );
  }

  return response.occurrences;
}

export async function createRoutine(
  input: RoutineDefinitionInput
): Promise<void> {
  if (getAppMode() === 'demo') {
    const data = readDemoData();
    const now = new Date().toISOString();

    data.routines.push({
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
    writeDemoData(data);
    return;
  }

  await requestHousehold('/api/routines', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateRoutine(
  id: string,
  input: RoutineDefinitionInput
): Promise<void> {
  if (getAppMode() === 'demo') {
    const data = readDemoData();
    const existing = data.routines.find(
      routine => routine.id === id
    );

    if (!existing) {
      throw new Error('Routine was not found.');
    }

    data.routines = data.routines.map(
      routine =>
        routine.id === id
          ? {
            ...existing,
            ...input,
            updatedAt:
              new Date().toISOString(),
          }
          : routine
    );
    writeDemoData(data);
    return;
  }

  await requestHousehold(
    `/api/routines/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    }
  );
}

export async function deleteRoutine(
  id: string
): Promise<void> {
  if (getAppMode() === 'demo') {
    const data = readDemoData();

    data.routines = data.routines.filter(
      routine => routine.id !== id
    );
    data.occurrences =
      data.occurrences.filter(
        occurrence =>
          occurrence.routineId !== id
      );
    writeDemoData(data);
    return;
  }

  await requestHousehold(
    `/api/routines/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    }
  );
}

export async function updateRoutineStep(
  routine: RoutineDefinition,
  localDate: string,
  timeZone: string,
  stepId: string,
  completed: boolean
): Promise<void> {
  if (getAppMode() === 'demo') {
    const data = readDemoData();
    const occurrenceId =
      `${routine.id}@${localDate}`;
    const existing = data.occurrences.find(
      occurrence =>
        occurrence.id === occurrenceId
    );
    const now = new Date().toISOString();
    const snapshot =
      existing?.snapshot ??
      createRoutineSnapshot(
        routine,
        now,
        'captured'
      );

    if (
      !snapshot.steps.some(
        step => step.id === stepId
      )
    ) {
      throw new Error(
        'Routine step was not found in this occurrence.'
      );
    }

    const wasCompleteBeforeUpdate =
      snapshot.steps.every(step =>
        Boolean(
          existing?.completedSteps[step.id]
        )
      );
    const completedSteps = {
      ...(existing?.completedSteps ?? {}),
    };

    if (completed) {
      completedSteps[stepId] = now;
    } else {
      delete completedSteps[stepId];
    }

    const allSnapshotStepsComplete =
      snapshot.steps.every(step =>
        Boolean(completedSteps[step.id])
      );
    const occurrence: RoutineOccurrence = {
      id: occurrenceId,
      routineId: routine.id,
      localDate,
      timeZone: existing?.timeZone ?? timeZone,
      snapshot,
      completedSteps,
      completedAt: allSnapshotStepsComplete
        ? wasCompleteBeforeUpdate
          ? existing?.completedAt ?? now
          : now
        : null,
      updatedAt: now,
    };

    data.occurrences = [
      ...data.occurrences.filter(
        candidate =>
          candidate.id !== occurrenceId
      ),
      occurrence,
    ];
    writeDemoData(data);
    return;
  }

  await requestHousehold(
    `/api/routines/${encodeURIComponent(routine.id)}/occurrence`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        localDate,
        timeZone,
        stepId,
        completed,
      }),
    }
  );
}
