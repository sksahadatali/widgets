import {
  createContext,
  useContext,
} from 'react';

import type {
  ZonedDateInfo,
} from './recurrence';
import type {
  RoutineDefinition,
  RoutineDefinitionInput,
  RoutineOccurrence,
} from '../types/routine';
import type {
  RoutineAttentionCandidate,
} from './routineSelectors';

export type RoutineContextValue = {
  routines: RoutineDefinition[];
  todayRoutines: RoutineDefinition[];
  routineAttentionCandidates:
    RoutineAttentionCandidate[];
  occurrenceByRoutineId: ReadonlyMap<
    string,
    RoutineOccurrence
  >;
  dateInfo: ZonedDateInfo;
  timeZone: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  saveRoutine: (
    input: RoutineDefinitionInput,
    routineId?: string
  ) => Promise<void>;
  removeRoutine: (
    routineId: string
  ) => Promise<void>;
  setStepCompleted: (
    routine: RoutineDefinition,
    stepId: string,
    completed: boolean
  ) => Promise<void>;
};

export const RoutineContext =
  createContext<RoutineContextValue | null>(
    null
  );

export function useRoutineContext(): RoutineContextValue {
  const context = useContext(RoutineContext);

  if (!context) {
    throw new Error(
      'useRoutineContext must be used inside RoutineProvider'
    );
  }

  return context;
}
