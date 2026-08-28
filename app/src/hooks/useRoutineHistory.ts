import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  loadRoutineHistory,
} from '../services/routineService';
import {
  resolveRoutineHistoryLoad,
} from '../routines/routineHistory';
import type {
  RoutineOccurrence,
} from '../types/routine';

type UseRoutineHistoryResult = {
  occurrences: RoutineOccurrence[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useRoutineHistory(
  householdToday: string
): UseRoutineHistoryResult {
  const [occurrences, setOccurrences] =
    useState<RoutineOccurrence[]>([]);
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result =
      await resolveRoutineHistoryLoad(
        loadRoutineHistory
      );

    setOccurrences(result.occurrences);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    const loadId = window.setTimeout(
      () => void refresh(),
      0
    );

    return () => {
      window.clearTimeout(loadId);
    };
  }, [householdToday, refresh]);

  return {
    occurrences,
    loading,
    error,
    refresh,
  };
}
