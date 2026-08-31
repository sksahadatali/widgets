import {
  DemoMealPlanStore,
} from '../meals/demoMealPlanStore';
import type {
  CreateMealPlanEntryInput,
  MealPlanEntry,
  UpdateMealPlanEntryInput,
} from '../types/mealPlan';
import {
  getAppMode,
  getHouseholdConfig,
} from './householdConfigService';
import { apiUrl } from './clientApi';

const REQUEST_TIMEOUT_MS = 15000;

const demoMealPlanStore = new DemoMealPlanStore(
  undefined,
  new Date(),
  getHouseholdConfig().location.timezone
);

type MealApiResponse =
  | {
    success: true;
    entries?: MealPlanEntry[];
    entry?: MealPlanEntry;
    created?: boolean;
    removed?: boolean;
  }
  | { success: false; error: string };

function json(body: unknown): RequestInit {
  return {
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

async function requestMeals(
  path: string,
  init?: RequestInit
): Promise<MealApiResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      apiUrl(path),
      {
        ...init,
        cache: 'no-store',
        signal: controller.signal,
      }
    );
    const payload =
      await response.json() as MealApiResponse;

    if (!response.ok || !payload.success) {
      throw new Error(
        payload.success
          ? 'Meals are unavailable.'
          : payload.error
      );
    }

    return payload;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : 'Meals are unavailable.',
      { cause: error }
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function loadMeals(
  windowStart: string
): Promise<MealPlanEntry[]> {
  if (getAppMode() === 'demo') {
    return demoMealPlanStore.readWindow(windowStart);
  }

  const payload = await requestMeals(
    `/api/meals?startDate=${encodeURIComponent(windowStart)}`
  );

  if (!payload.success || !payload.entries) {
    throw new Error('Meals are unavailable.');
  }

  return payload.entries;
}

export async function createMeal(
  input: CreateMealPlanEntryInput
): Promise<void> {
  if (getAppMode() === 'demo') {
    demoMealPlanStore.createEntry(input);
    return;
  }

  await requestMeals('/api/meals', {
    method: 'POST',
    ...json(input),
  });
}

export async function updateMeal(
  entryId: string,
  input: UpdateMealPlanEntryInput
): Promise<void> {
  if (getAppMode() === 'demo') {
    demoMealPlanStore.updateEntry(entryId, input);
    return;
  }

  await requestMeals(
    `/api/meals/${encodeURIComponent(entryId)}`,
    {
      method: 'PATCH',
      ...json(input),
    }
  );
}

export async function removeMeal(
  entryId: string
): Promise<void> {
  if (getAppMode() === 'demo') {
    demoMealPlanStore.removeEntry(entryId);
    return;
  }

  await requestMeals(
    `/api/meals/${encodeURIComponent(entryId)}`,
    { method: 'DELETE' }
  );
}
