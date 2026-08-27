import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  generateTodayFocus,
} from '../brain/todayBrain';
import type {
  BrainInput,
  BrainResult,
} from '../brain/types';
import {
  useRoutineContext,
} from '../routines/useRoutineContext';
import {
  getTodayFocusSources,
} from '../services/focusService';

type FocusSources = Omit<
  BrainInput,
  'routineCandidates'
>;

interface UseFocusResult {
  brain: BrainResult | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useFocus(): UseFocusResult {
  const {
    routineAttentionCandidates,
  } = useRoutineContext();
  const [sources, setSources] =
    useState<FocusSources | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFocus = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const result =
        await getTodayFocusSources();

      setSources(result);
    } catch (err) {
      console.error("Failed to load Today's Focus:", err);
      setError("Unable to load today's focus.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoadId = window.setTimeout(
      () => void loadFocus(),
      0
    );

    return () => {
      window.clearTimeout(initialLoadId);
    };
  }, [loadFocus]);

  const brain = useMemo<BrainResult | null>(
    () => sources
      ? generateTodayFocus(
        {
          ...sources,
          routineCandidates:
            routineAttentionCandidates,
        },
        new Date()
      )
      : null,
    [
      routineAttentionCandidates,
      sources,
    ]
  );

  return {
    brain,
    loading,
    error,
    refresh: loadFocus,
  };
}
