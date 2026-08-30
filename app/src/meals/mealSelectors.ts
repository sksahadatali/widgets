import {
  getMealWeekDates,
} from './mealDates';
import type {
  MealPlanEntry,
  MealType,
} from '../types/mealPlan';

export const MEAL_TYPES: readonly MealType[] = [
  'breakfast',
  'lunch',
  'dinner',
];

export const MEAL_TYPE_LABELS:
  Record<MealType, string> = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
  };

export type MealPlanDay = {
  localDate: string;
  isToday: boolean;
  entries: Record<MealType, MealPlanEntry[]>;
};

export function selectMealPlanWeek(
  entries: MealPlanEntry[],
  weekStart: string,
  householdToday: string
): MealPlanDay[] {
  return getMealWeekDates(weekStart).map(
    localDate => ({
      localDate,
      isToday: localDate === householdToday,
      entries: {
        breakfast: entries.filter(
          entry =>
            entry.localDate === localDate &&
            entry.mealType === 'breakfast'
        ),
        lunch: entries.filter(
          entry =>
            entry.localDate === localDate &&
            entry.mealType === 'lunch'
        ),
        dinner: entries.filter(
          entry =>
            entry.localDate === localDate &&
            entry.mealType === 'dinner'
        ),
      },
    })
  );
}
