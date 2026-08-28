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

export type RoutineRewardContract = {
  recipientProfileId: string;
  currency: 'star';
  amount: number;
};

export type RoutineDefinition = {
  id: string;
  title: string;
  ownerProfileId: string;
  active: boolean;
  schedule: RoutineSchedule;
  steps: RoutineStep[];
  reward: RoutineRewardContract | null;
  createdAt: string;
  updatedAt: string;
};

export type RoutineDefinitionInput = {
  title: string;
  ownerProfileId: string;
  active: boolean;
  schedule: RoutineSchedule;
  steps: RoutineStep[];
  reward: RoutineRewardContract | null;
};

export type RoutineOccurrenceSnapshot = {
  title: string;
  ownerProfileId: string;
  schedule: RoutineSchedule;
  steps: RoutineStep[];
  definitionUpdatedAt: string;
  capturedAt: string;
  source: 'captured' | 'legacy-migration';
};

export type RoutineOccurrence = {
  id: string;
  routineId: string;
  localDate: string;
  timeZone: string;
  snapshot: RoutineOccurrenceSnapshot;
  rewardContract: RoutineRewardContract | null;
  completionSequence: number;
  completedSteps: Record<string, string>;
  completedAt: string | null;
  updatedAt: string;
};

export type RoutineData = {
  routines: RoutineDefinition[];
  occurrences: RoutineOccurrence[];
};

export type RoutineTimeStatus =
  | 'today'
  | 'upcoming'
  | 'due'
  | 'overdue'
  | 'completed';
