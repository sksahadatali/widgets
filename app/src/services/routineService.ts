import exampleStore from '../data/routines.example.json';
import type {
  RoutineData,
  RoutineDefinition,
  RoutineDefinitionInput,
  RoutineOccurrence,
} from '../types/routine';
import {
  getAppMode,
} from './householdConfigService';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:3001';
const DEMO_STORAGE_KEY =
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
    Array.isArray(value.routines) &&
    value.routines.every(isRoutineDefinition) &&
    Array.isArray(value.occurrences) &&
    value.occurrences.every(isRoutineOccurrence)
  );
}

function cloneExampleData(): RoutineData {
  return structuredClone(
    exampleStore as RoutineData
  );
}

function readDemoData(): RoutineData {
  const stored = window.localStorage.getItem(
    DEMO_STORAGE_KEY
  );

  if (!stored) {
    return cloneExampleData();
  }

  try {
    const parsed = JSON.parse(stored) as unknown;

    if (!isRoutineData(parsed)) {
      throw new Error('Invalid demo data');
    }

    return parsed;
  } catch {
    throw new Error(
      'Demo routine data is invalid. Clear this site\'s local storage to restore the safe examples.'
    );
  }
}

function writeDemoData(data: RoutineData): void {
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
    const wasCompleteBeforeUpdate =
      routine.steps.every(step =>
        Boolean(
          existing?.completedSteps[step.id]
        )
      );
    const now = new Date().toISOString();
    const completedSteps = {
      ...(existing?.completedSteps ?? {}),
    };

    if (completed) {
      completedSteps[stepId] = now;
    } else {
      delete completedSteps[stepId];
    }

    const allCurrentStepsComplete =
      routine.steps.every(step =>
        Boolean(completedSteps[step.id])
      );
    const occurrence: RoutineOccurrence = {
      id: occurrenceId,
      routineId: routine.id,
      localDate,
      timeZone,
      completedSteps,
      completedAt: allCurrentStepsComplete
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
