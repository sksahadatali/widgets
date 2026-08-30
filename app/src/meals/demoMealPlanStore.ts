import {
  getHouseholdToday,
  getMealWeekDates,
  getMealWeekStart,
  isValidLocalDate,
  shiftMealLocalDate,
} from './mealDates';
import type {
  CreateMealPlanEntryInput,
  MealPlanEntry,
  MealPlanStoreData,
  MealType,
  UpdateMealPlanEntryInput,
} from '../types/mealPlan';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MEAL_TYPES: readonly MealType[] = [
  'breakfast',
  'lunch',
  'dinner',
];

type DemoSeed = {
  id: string;
  dayOffset: number;
  mealType: MealType;
  title: string;
};

const SAFE_DEMO_SEEDS: readonly DemoSeed[] = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    dayOffset: 0,
    mealType: 'breakfast',
    title: 'Porridge',
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    dayOffset: 2,
    mealType: 'lunch',
    title: 'Soup and sandwiches',
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    dayOffset: 4,
    mealType: 'dinner',
    title: 'Vegetable pasta',
  },
];

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: string[]
): boolean {
  const actual = Object.keys(value);

  return actual.length === keys.length &&
    actual.every(key => keys.includes(key));
}

function isIsoTimestamp(
  value: unknown
): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);

  return !Number.isNaN(parsed) &&
    value === new Date(parsed).toISOString();
}

function isMealType(
  value: unknown
): value is MealType {
  return typeof value === 'string' &&
    MEAL_TYPES.includes(value as MealType);
}

function isEntry(
  value: unknown
): value is MealPlanEntry {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'id',
      'localDate',
      'mealType',
      'title',
      'createdAt',
      'updatedAt',
    ]) ||
    typeof value.id !== 'string' ||
    !UUID_PATTERN.test(value.id) ||
    !isValidLocalDate(value.localDate) ||
    !isMealType(value.mealType) ||
    typeof value.title !== 'string' ||
    !value.title ||
    value.title !== value.title.trim() ||
    value.title.length > 160 ||
    !isIsoTimestamp(value.createdAt) ||
    !isIsoTimestamp(value.updatedAt)
  ) {
    return false;
  }

  return Date.parse(value.updatedAt) >=
    Date.parse(value.createdAt);
}

export function validateDemoMealPlanStore(
  value: unknown
): MealPlanStoreData {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'schemaVersion',
      'entries',
    ]) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.entries) ||
    !value.entries.every(isEntry)
  ) {
    throw new Error(
      'Safe Demo Meals data is invalid.'
    );
  }

  const store = value as MealPlanStoreData;
  const ids = store.entries.map(entry => entry.id);

  if (new Set(ids).size !== ids.length) {
    throw new Error(
      'Safe Demo Meals data violates identity invariants.'
    );
  }

  return store;
}

function normalizeUuid(value: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(
      'Meal entry ID must be a canonical lowercase UUID.'
    );
  }

  return value;
}

function normalizeTitle(value: string): string {
  const title = value.trim();

  if (!title || title.length > 160) {
    throw new Error(
      'Meal title must be from 1 to 160 characters.'
    );
  }

  return title;
}

function normalizeSlot(
  localDate: string,
  mealType: MealType
): { localDate: string; mealType: MealType } {
  if (!isValidLocalDate(localDate)) {
    throw new Error(
      'Meal date must be a real Gregorian date using YYYY-MM-DD.'
    );
  }

  if (!isMealType(mealType)) {
    throw new Error(
      'Meal type must be breakfast, lunch or dinner.'
    );
  }

  return { localDate, mealType };
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
  } else {
    entries.splice(lastTargetIndex + 1, 0, entry);
  }
}

function createSeedStore(
  now: Date,
  timeZone: string
): MealPlanStoreData {
  const weekStart = getMealWeekStart(
    getHouseholdToday(now, timeZone)
  );
  const timestamp = now.toISOString();

  return {
    schemaVersion: 1,
    entries: SAFE_DEMO_SEEDS.map(seed => ({
      id: seed.id,
      localDate: shiftMealLocalDate(
        weekStart,
        seed.dayOffset
      ),
      mealType: seed.mealType,
      title: seed.title,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  };
}

export class DemoMealPlanStore {
  private store: MealPlanStoreData;

  constructor(
    initial?: unknown,
    now = new Date(),
    timeZone = 'Europe/London'
  ) {
    this.store = structuredClone(
      validateDemoMealPlanStore(
        initial ?? createSeedStore(now, timeZone)
      )
    );
  }

  read(): MealPlanStoreData {
    return structuredClone(this.store);
  }

  readWeek(weekStart: string): MealPlanEntry[] {
    const weekDates = new Set(
      getMealWeekDates(weekStart)
    );

    return structuredClone(
      this.store.entries.filter(entry =>
        weekDates.has(entry.localDate)
      )
    );
  }

  private validate(): void {
    validateDemoMealPlanStore(this.store);
  }

  createEntry(
    input: CreateMealPlanEntryInput,
    now = new Date()
  ): { entry: MealPlanEntry; created: boolean } {
    const id = normalizeUuid(input.id);
    const slot = normalizeSlot(
      input.localDate,
      input.mealType
    );
    const title = normalizeTitle(input.title);
    const existing = this.store.entries.find(
      entry => entry.id === id
    );

    if (existing) {
      if (
        existing.localDate === slot.localDate &&
        existing.mealType === slot.mealType &&
        existing.title === title
      ) {
        return {
          entry: structuredClone(existing),
          created: false,
        };
      }

      throw new Error(
        'Meal entry ID is already used by a different entry.'
      );
    }

    const timestamp = now.toISOString();
    const entry: MealPlanEntry = {
      id,
      ...slot,
      title,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    insertAfterTargetSlot(this.store.entries, entry);
    this.validate();

    return {
      entry: structuredClone(entry),
      created: true,
    };
  }

  updateEntry(
    entryId: string,
    input: UpdateMealPlanEntryInput,
    now = new Date()
  ): MealPlanEntry {
    const id = normalizeUuid(entryId);
    const index = this.store.entries.findIndex(
      entry => entry.id === id
    );

    if (index < 0) {
      throw new Error('Meal entry was not found.');
    }

    const hasDate = input.localDate !== undefined;
    const hasMealType = input.mealType !== undefined;

    if (hasDate !== hasMealType) {
      throw new Error(
        'A meal move requires both localDate and mealType.'
      );
    }

    if (
      input.title === undefined &&
      !hasDate
    ) {
      throw new Error('Meal update is invalid.');
    }

    const entry = this.store.entries[index];
    const title = input.title === undefined
      ? entry.title
      : normalizeTitle(input.title);
    const slot = hasDate
      ? normalizeSlot(
        input.localDate!,
        input.mealType!
      )
      : {
        localDate: entry.localDate,
        mealType: entry.mealType,
      };
    const slotChanged =
      slot.localDate !== entry.localDate ||
      slot.mealType !== entry.mealType;

    if (!slotChanged && title === entry.title) {
      return structuredClone(entry);
    }

    const updatedEntry: MealPlanEntry = {
      ...entry,
      ...slot,
      title,
      updatedAt: now.toISOString(),
    };

    if (slotChanged) {
      this.store.entries.splice(index, 1);
      insertAfterTargetSlot(
        this.store.entries,
        updatedEntry
      );
    } else {
      this.store.entries[index] = updatedEntry;
    }

    this.validate();
    return structuredClone(updatedEntry);
  }

  removeEntry(entryId: string): boolean {
    const id = normalizeUuid(entryId);
    const index = this.store.entries.findIndex(
      entry => entry.id === id
    );

    if (index < 0) return false;
    this.store.entries.splice(index, 1);
    this.validate();
    return true;
  }
}
