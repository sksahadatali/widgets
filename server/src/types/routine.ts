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

export type RoutineStoreData = {
  schemaVersion: 3;
  routines: RoutineDefinition[];
  occurrences: RoutineOccurrence[];
};

export type LegacyRoutineDefinition = Omit<
  RoutineDefinition,
  'reward'
>;

export type LegacyRoutineOccurrence = Omit<
  RoutineOccurrence,
  'snapshot' | 'rewardContract' | 'completionSequence'
>;

export type LegacyRoutineStoreData = {
  schemaVersion: 1;
  routines: LegacyRoutineDefinition[];
  occurrences: LegacyRoutineOccurrence[];
};

export type LegacyRoutineOccurrenceV2 = Omit<
  RoutineOccurrence,
  'rewardContract' | 'completionSequence'
>;

export type LegacyRoutineStoreDataV2 = {
  schemaVersion: 2;
  routines: LegacyRoutineDefinition[];
  occurrences: LegacyRoutineOccurrenceV2[];
};

export type RoutineDefinitionInput = {
  title: string;
  ownerProfileId: string;
  active: boolean;
  schedule: RoutineSchedule;
  steps: RoutineStep[];
  reward: RoutineRewardContract | null;
};

export type RoutineOccurrenceUpdate = {
  localDate: string;
  timeZone: string;
  stepId: string;
  completed: boolean;
};

export type RoutineMaterializationInput = {
  timeZone: string;
};
