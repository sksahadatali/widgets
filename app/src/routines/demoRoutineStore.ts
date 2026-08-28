import type {
  RoutineData,
  RoutineDefinition,
  RoutineOccurrence,
  RoutineOccurrenceSnapshot,
} from '../types/routine';
import {
  getZonedDateInfo,
} from './recurrence';

export type DemoRoutineStore = RoutineData & {
  schemaVersion: 3;
};

export type LegacyDemoOccurrence = Omit<
  RoutineOccurrence,
  'snapshot'
>;

export type LegacyDemoStore = {
  schemaVersion: 1;
  routines: Array<Omit<RoutineDefinition, 'reward'>>;
  occurrences: LegacyDemoOccurrence[];
};

export type LegacyDemoStoreV2 = {
  schemaVersion: 2;
  routines: Array<Omit<RoutineDefinition, 'reward'>>;
  occurrences: Array<Omit<
    RoutineOccurrence,
    'rewardContract' | 'completionSequence'
  >>;
};

export function createRoutineSnapshot(
  routine: Omit<RoutineDefinition, 'reward'>,
  capturedAt: string,
  source: RoutineOccurrenceSnapshot['source']
): RoutineOccurrenceSnapshot {
  return {
    title: routine.title,
    ownerProfileId: routine.ownerProfileId,
    schedule: structuredClone(routine.schedule),
    steps: structuredClone(routine.steps),
    definitionUpdatedAt: routine.updatedAt,
    capturedAt,
    source,
  };
}

export function migrateLegacyDemoStore(
  legacy: LegacyDemoStore,
  migratedAt = new Date().toISOString()
): LegacyDemoStoreV2 {
  const routineById = new Map(
    legacy.routines.map(routine => [
      routine.id,
      routine,
    ])
  );

  return {
    schemaVersion: 2,
    routines: structuredClone(legacy.routines),
    occurrences: legacy.occurrences.map(
      occurrence => {
        const routine = routineById.get(
          occurrence.routineId
        );

        if (!routine) {
          throw new Error(
            'Invalid demo occurrence relationship.'
          );
        }

        return {
          ...structuredClone(occurrence),
          snapshot: createRoutineSnapshot(
            routine,
            migratedAt,
            'legacy-migration'
          ),
        };
      }
    ),
  };
}

export function migrateDemoStoreV2(
  legacy: LegacyDemoStoreV2
): DemoRoutineStore {
  return {
    schemaVersion: 3,
    routines: legacy.routines.map(routine => ({
      ...structuredClone(routine),
      reward: null,
    })),
    occurrences: legacy.occurrences.map(occurrence => ({
      ...structuredClone(occurrence),
      rewardContract: null,
      completionSequence:
        occurrence.snapshot.steps.every(step =>
          Boolean(occurrence.completedSteps[step.id])
        ) ? 1 : 0,
    })),
  };
}

export function materializeDemoRoutines(
  data: DemoRoutineStore,
  timeZone: string,
  now = new Date()
): {
  store: DemoRoutineStore;
  localDate: string;
  materializedCount: number;
} {
  const dateInfo = getZonedDateInfo(
    now,
    timeZone
  );
  const existingIds = new Set(
    data.occurrences.map(
      occurrence => occurrence.id
    )
  );
  const capturedAt = now.toISOString();
  const newOccurrences = data.routines
    .filter(
      routine =>
        routine.active &&
        routine.schedule.daysOfWeek.includes(
          dateInfo.weekday
        )
    )
    .filter(
      routine =>
        !existingIds.has(
          `${routine.id}@${dateInfo.localDate}`
        )
    )
    .map<RoutineOccurrence>(routine => ({
      id: `${routine.id}@${dateInfo.localDate}`,
      routineId: routine.id,
      localDate: dateInfo.localDate,
      timeZone,
      snapshot: createRoutineSnapshot(
        routine,
        capturedAt,
        'captured'
      ),
      rewardContract: structuredClone(
        routine.reward
      ),
      completionSequence: 0,
      completedSteps: {},
      completedAt: null,
      updatedAt: capturedAt,
    }));

  return {
    store: newOccurrences.length === 0
      ? data
      : {
        ...data,
        occurrences: [
          ...data.occurrences,
          ...newOccurrences,
        ],
      },
    localDate: dateInfo.localDate,
    materializedCount: newOccurrences.length,
  };
}
