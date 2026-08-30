import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  createMeal,
  loadMeals,
  removeMeal,
  updateMeal,
} from '../services/mealService';
import type {
  CreateMealPlanEntryInput,
  MealPlanEntry,
  UpdateMealPlanEntryInput,
} from '../types/mealPlan';

export function useMeals(windowStart: string) {
  const [entries, setEntries] =
    useState<MealPlanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] =
    useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      setEntries(await loadMeals(windowStart));
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Meals are unavailable.'
      );
    } finally {
      setLoading(false);
    }
  }, [windowStart]);

  useEffect(() => {
    const loadId = window.setTimeout(
      () => void refresh(),
      0
    );

    return () => window.clearTimeout(loadId);
  }, [refresh]);

  const runMutation = useCallback(
    async (mutation: () => Promise<void>) => {
      setSaving(true);

      try {
        await mutation();
        setEntries(await loadMeals(windowStart));
        setError(null);
      } catch (mutationError) {
        setError(
          mutationError instanceof Error
            ? mutationError.message
            : 'Unable to update Meals.'
        );
        throw mutationError;
      } finally {
        setSaving(false);
      }
    },
    [windowStart]
  );

  return {
    entries,
    loading,
    saving,
    error,
    refresh,
    createMeal: (
      input: CreateMealPlanEntryInput
    ) => runMutation(() => createMeal(input)),
    updateMeal: (
      entryId: string,
      input: UpdateMealPlanEntryInput
    ) => runMutation(
      () => updateMeal(entryId, input)
    ),
    removeMeal: (entryId: string) =>
      runMutation(() => removeMeal(entryId)),
  };
}
