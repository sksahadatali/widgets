import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useHouseholdProfile,
} from '../household/useHouseholdProfile';
import {
  getHouseholdConfig,
} from '../services/householdConfigService';
import {
  createRoutine,
  deleteRoutine,
  loadRoutines,
  materializeTodayRoutines,
  updateRoutine,
  updateRoutineStep,
} from '../services/routineService';
import type {
  RoutineData,
  RoutineDefinition,
  RoutineDefinitionInput,
  RoutineOccurrence,
} from '../types/routine';
import {
  getZonedDateInfo,
} from './recurrence';
import {
  selectRoutineAttentionCandidates,
  selectVisibleTodayRoutines,
} from './routineSelectors';
import {
  RoutineContext,
  type RoutineContextValue,
} from './useRoutineContext';

const EMPTY_DATA: RoutineData = {
  routines: [],
  occurrences: [],
};

type RoutineProviderProps = {
  children: ReactNode;
};

export function RoutineProvider({
  children,
}: RoutineProviderProps) {
  const {
    profiles,
    selectedProfileId,
  } = useHouseholdProfile();
  const timeZone =
    getHouseholdConfig().location.timezone;
  const [clock, setClock] = useState(
    () => new Date()
  );
  const [data, setData] =
    useState<RoutineData>(EMPTY_DATA);
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState<string | null>(null);
  const [saving, setSaving] =
    useState(false);

  const dateInfo = useMemo(
    () => getZonedDateInfo(clock, timeZone),
    [clock, timeZone]
  );

  const refresh = useCallback(async () => {
    try {
      const now = new Date();
      const localDate =
        await materializeTodayRoutines(
          timeZone,
          now
        );
      const nextData = await loadRoutines(
        localDate
      );

      setClock(new Date());
      setData(nextData);
      setError(null);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Unable to load routines.'
      );
    } finally {
      setLoading(false);
    }
  }, [timeZone]);

  useEffect(() => {
    const initialLoadId = window.setTimeout(
      () => void refresh(),
      0
    );

    return () => {
      window.clearTimeout(initialLoadId);
    };
  }, [refresh]);

  useEffect(() => {
    const updateClock = () => {
      setClock(new Date());
      void refresh();
    };
    const handleVisibility = () => {
      if (!document.hidden) {
        updateClock();
      }
    };
    const intervalId = window.setInterval(
      updateClock,
      60000
    );

    window.addEventListener('focus', updateClock);
    document.addEventListener(
      'visibilitychange',
      handleVisibility
    );

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener(
        'focus',
        updateClock
      );
      document.removeEventListener(
        'visibilitychange',
        handleVisibility
      );
    };
  }, [refresh]);

  const occurrenceByRoutineId = useMemo(
    () => new Map(
      data.occurrences.map(occurrence => [
        occurrence.routineId,
        occurrence,
      ])
    ),
    [data.occurrences]
  );

  const todayRoutines = useMemo(
    () => selectVisibleTodayRoutines({
      routines: data.routines,
      occurrenceByRoutineId,
      profiles,
      selectedProfileId,
      dateInfo,
    }),
    [
      data.routines,
      dateInfo,
      occurrenceByRoutineId,
      profiles,
      selectedProfileId,
    ]
  );

  const routineAttentionCandidates = useMemo(
    () => error
      ? []
      : selectRoutineAttentionCandidates({
        routines: todayRoutines,
        occurrenceByRoutineId,
        dateInfo,
      }),
    [
      dateInfo,
      error,
      occurrenceByRoutineId,
      todayRoutines,
    ]
  );

  const runMutation = useCallback(
    async (
      mutation: () => Promise<void>
    ) => {
      setSaving(true);

      try {
        await mutation();
        await refresh();
      } catch (mutationError) {
        const message =
          mutationError instanceof Error
            ? mutationError.message
            : 'Unable to update routines.';

        setError(message);
        throw mutationError;
      } finally {
        setSaving(false);
      }
    },
    [refresh]
  );

  const saveRoutine = useCallback(
    async (
      input: RoutineDefinitionInput,
      routineId?: string
    ) => runMutation(() =>
      routineId
        ? updateRoutine(routineId, input)
        : createRoutine(input)
    ),
    [runMutation]
  );

  const removeRoutine = useCallback(
    async (routineId: string) =>
      runMutation(() =>
        deleteRoutine(routineId)
      ),
    [runMutation]
  );

  const setStepCompleted = useCallback(
    async (
      routine: RoutineDefinition,
      stepId: string,
      completed: boolean
    ) => runMutation(() =>
      updateRoutineStep(
        routine,
        dateInfo.localDate,
        timeZone,
        stepId,
        completed
      )
    ),
    [
      dateInfo.localDate,
      runMutation,
      timeZone,
    ]
  );

  const value = useMemo<RoutineContextValue>(
    () => ({
      routines: data.routines,
      todayRoutines,
      routineAttentionCandidates,
      occurrenceByRoutineId:
        occurrenceByRoutineId as ReadonlyMap<
          string,
          RoutineOccurrence
        >,
      dateInfo,
      timeZone,
      loading,
      saving,
      error,
      refresh,
      saveRoutine,
      removeRoutine,
      setStepCompleted,
    }),
    [
      data.routines,
      todayRoutines,
      routineAttentionCandidates,
      occurrenceByRoutineId,
      dateInfo,
      timeZone,
      loading,
      saving,
      error,
      refresh,
      saveRoutine,
      removeRoutine,
      setStepCompleted,
    ]
  );

  return (
    <RoutineContext.Provider value={value}>
      {children}
    </RoutineContext.Provider>
  );
}
