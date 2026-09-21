import assert from 'node:assert/strict';
import {
  describe,
  it,
} from 'node:test';

import type {
  HouseholdProfile,
} from '../../app/src/household/householdProfiles.ts';
import {
  addRoutineDays,
  getRoutineWeekDates,
  getRoutineWeekStart,
  selectRoutineWeekEntries,
} from '../../app/src/routines/routineWeek.ts';
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
    id: 'child-1',
    kind: 'member',
    displayName: 'Sam',
    memberType: 'child',
  },
];

function routine(
  id: string,
  overrides: Partial<RoutineDefinition> = {}
): RoutineDefinition {
  return {
    id,
    title: id,
    ownerProfileId: 'child-1',
    active: true,
    schedule: {
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      startTime: null,
      endTime: null,
    },
    steps: [
      { id: `${id}-step`, title: 'Complete' },
    ],
    reward: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function occurrence(
  definition: RoutineDefinition,
  localDate: string,
  overrides: Partial<RoutineOccurrence> = {}
): RoutineOccurrence {
  return {
    id: `${definition.id}@${localDate}`,
    routineId: definition.id,
    localDate,
    timeZone: 'Europe/London',
    snapshot: {
      title: definition.title,
      ownerProfileId: definition.ownerProfileId,
      schedule: structuredClone(definition.schedule),
      steps: structuredClone(definition.steps),
      definitionUpdatedAt: definition.updatedAt,
      capturedAt: `${localDate}T07:00:00.000Z`,
      source: 'captured',
    },
    rewardContract: null,
    completionSequence: 0,
    completedSteps: {},
    completedAt: null,
    updatedAt: `${localDate}T07:00:00.000Z`,
    ...overrides,
  };
}

describe('Routine seven-day selection', () => {
  it('builds a stable Monday-to-Sunday row and moves exactly seven days', () => {
    const start = getRoutineWeekStart('2026-09-24');

    assert.equal(start, '2026-09-21');
    assert.deepEqual(getRoutineWeekDates(start), [
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ]);
    assert.equal(
      addRoutineDays(start, 7),
      '2026-09-28'
    );
    assert.equal(
      addRoutineDays(start, -7),
      '2026-09-14'
    );
  });

  it('uses captured past occurrences without fabricating missing history', () => {
    const kumon = routine('kumon');
    const floor = routine('clean-floor', {
      ownerProfileId: 'family',
      steps: [],
    });
    const captured = occurrence(
      kumon,
      '2026-09-14',
      {
        completedSteps: {
          'kumon-step':
            '2026-09-14T08:00:00.000Z',
        },
        completedAt:
          '2026-09-14T08:00:00.000Z',
      }
    );

    assert.deepEqual(
      selectRoutineWeekEntries({
        routines: [kumon, floor],
        occurrences: [captured],
        profiles: PROFILES,
        selectedProfileId: 'family',
        localDate: '2026-09-14',
        householdToday: '2026-09-21',
      }).map(entry => entry.routine.id),
      ['kumon']
    );
  });

  it('shows ordinary multi-step and step-less definitions on current and future dates', () => {
    const kumon = routine('kumon', {
      steps: [
        { id: 'math', title: 'Math' },
        { id: 'english', title: 'English' },
      ],
    });
    const floor = routine('clean-floor', {
      ownerProfileId: 'family',
      steps: [],
    });

    assert.deepEqual(
      selectRoutineWeekEntries({
        routines: [kumon, floor],
        occurrences: [],
        profiles: PROFILES,
        selectedProfileId: 'child-1',
        localDate: '2026-09-21',
        householdToday: '2026-09-21',
      }).map(entry => [
        entry.routine.id,
        entry.routine.steps.length,
      ]),
      [
        ['kumon', 2],
        ['clean-floor', 0],
      ]
    );
  });
});
