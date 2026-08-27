import assert from 'node:assert/strict';
import {
  describe,
  it,
} from 'node:test';

import type {
  HouseholdProfile,
} from '../../app/src/household/householdProfiles.ts';
import {
  selectVisibleTodayRoutines,
} from '../../app/src/routines/routineSelectors.ts';
import type {
  RoutineDefinition,
  RoutineOccurrence,
} from '../../app/src/types/routine.ts';

const PROFILES: HouseholdProfile[] = [
  {
    id: 'family',
    kind: 'family',
    displayName: 'Example Household',
  },
  {
    id: 'adult-1',
    kind: 'member',
    displayName: 'Alex',
    memberType: 'adult',
  },
  {
    id: 'child-1',
    kind: 'member',
    displayName: 'Sam',
    memberType: 'child',
  },
];

function routine(
  id: string,
  ownerProfileId: string
): RoutineDefinition {
  return {
    id,
    title: id,
    ownerProfileId,
    active: true,
    schedule: {
      daysOfWeek: [1],
      startTime: null,
      endTime: null,
    },
    steps: [
      { id: `${id}-step`, title: 'Step' },
    ],
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  };
}

function occurrence(
  definition: RoutineDefinition,
  snapshotOwner = definition.ownerProfileId
): RoutineOccurrence {
  return {
    id: `${definition.id}@2026-08-31`,
    routineId: definition.id,
    localDate: '2026-08-31',
    timeZone: 'Europe/London',
    snapshot: {
      title: definition.title,
      ownerProfileId: snapshotOwner,
      schedule: structuredClone(
        definition.schedule
      ),
      steps: structuredClone(definition.steps),
      definitionUpdatedAt:
        definition.updatedAt,
      capturedAt: '2026-08-31T06:00:00.000Z',
      source: 'captured',
    },
    completedSteps: {},
    completedAt: null,
    updatedAt: '2026-08-31T06:00:00.000Z',
  };
}

const DATE_INFO = {
  localDate: '2026-08-31',
  weekday: 1 as const,
  minutesSinceMidnight: 7 * 60,
};

describe('routine profile visibility', () => {
  const routines = [
    routine('family-routine', 'family'),
    routine('adult-routine', 'adult-1'),
    routine('child-routine', 'child-1'),
    routine('orphan-routine', 'removed-1'),
  ];
  const occurrences = new Map(
    routines.map(definition => [
      definition.id,
      occurrence(definition),
    ])
  );

  it('shows Family plus all configured member routines in Family context', () => {
    assert.deepEqual(
      selectVisibleTodayRoutines({
        routines,
        occurrenceByRoutineId: occurrences,
        profiles: PROFILES,
        selectedProfileId: 'family',
        dateInfo: DATE_INFO,
      }).map(item => item.id),
      [
        'family-routine',
        'adult-routine',
        'child-routine',
      ]
    );
  });

  it('shows Family plus only the selected member routine in individual context', () => {
    assert.deepEqual(
      selectVisibleTodayRoutines({
        routines,
        occurrenceByRoutineId: occurrences,
        profiles: PROFILES,
        selectedProfileId: 'adult-1',
        dateInfo: DATE_INFO,
      }).map(item => item.id),
      [
        'family-routine',
        'adult-routine',
      ]
    );
  });

  it('uses the immutable occurrence assignment after the definition is reassigned', () => {
    const reassigned = routine(
      'reassigned-routine',
      'child-1'
    );
    const capturedForAdult = occurrence(
      reassigned,
      'adult-1'
    );

    assert.deepEqual(
      selectVisibleTodayRoutines({
        routines: [reassigned],
        occurrenceByRoutineId: new Map([
          [reassigned.id, capturedForAdult],
        ]),
        profiles: PROFILES,
        selectedProfileId: 'adult-1',
        dateInfo: DATE_INFO,
      }).map(item => item.ownerProfileId),
      ['adult-1']
    );
    assert.deepEqual(
      selectVisibleTodayRoutines({
        routines: [reassigned],
        occurrenceByRoutineId: new Map([
          [reassigned.id, capturedForAdult],
        ]),
        profiles: PROFILES,
        selectedProfileId: 'child-1',
        dateInfo: DATE_INFO,
      }),
      []
    );
  });
});
