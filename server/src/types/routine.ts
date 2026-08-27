export type IsoWeekday =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7;

export type RoutineStep = {
  id: string;
  title: string;
};

export type RoutineSchedule = {
  daysOfWeek: IsoWeekday[];
  startTime: string | null;
  endTime: string | null;
};

export type RoutineDefinition = {
  id: string;
  title: string;
  ownerProfileId: string;
  active: boolean;
  schedule: RoutineSchedule;
  steps: RoutineStep[];
  createdAt: string;
  updatedAt: string;
};

export type RoutineOccurrence = {
  id: string;
  routineId: string;
  localDate: string;
  timeZone: string;
  completedSteps: Record<string, string>;
  completedAt: string | null;
  updatedAt: string;
};

export type RoutineStoreData = {
  schemaVersion: 1;
  routines: RoutineDefinition[];
  occurrences: RoutineOccurrence[];
};

export type RoutineDefinitionInput = {
  title: string;
  ownerProfileId: string;
  active: boolean;
  schedule: RoutineSchedule;
  steps: RoutineStep[];
};

export type RoutineOccurrenceUpdate = {
  localDate: string;
  timeZone: string;
  stepId: string;
  completed: boolean;
};
