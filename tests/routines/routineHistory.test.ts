import assert from 'node:assert/strict';
import {
  readFile,
} from 'node:fs/promises';
import {
  describe,
  it,
} from 'node:test';

import type {
  HouseholdProfile,
} from '../../app/src/household/householdProfiles.ts';
import {
  getZonedDateInfo,
} from '../../app/src/routines/recurrence.ts';
import {
  createRoutineHistoryItem,
  getRoutineHistoryMetrics,
  getRoutineHistoryOutcome,
  getRoutineHistoryRange,
  resolveRoutineHistoryLoad,
  selectRoutineHistory,
  selectVisibleHistoryOccurrences,
  shiftLocalDate,
} from '../../app/src/routines/routineHistory.ts';
import type {
  RoutineOccurrence,
  RoutineOccurrenceSnapshot,
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

function snapshot(
  ownerProfileId = 'family',
  overrides: Partial<
    RoutineOccurrenceSnapshot
  > = {}
): RoutineOccurrenceSnapshot {
  return {
    title: 'Captured morning routine',
    ownerProfileId,
    schedule: {
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: '07:00',
      endTime: '08:00',
    },
    steps: [
      { id: 'step-1', title: 'Captured first' },
      { id: 'step-2', title: 'Captured second' },
      { id: 'step-3', title: 'Captured third' },
    ],
    definitionUpdatedAt:
      '2026-08-20T06:00:00.000Z',
    capturedAt:
      '2026-08-24T06:00:00.000Z',
    source: 'captured',
    ...overrides,
  };
}

function occurrence(
  id: string,
  localDate: string,
  ownerProfileId = 'family',
  completedStepIds: string[] = [],
  snapshotOverrides: Partial<
    RoutineOccurrenceSnapshot
  > = {}
): RoutineOccurrence {
  const occurrenceSnapshot = snapshot(
    ownerProfileId,
    snapshotOverrides
  );
  const completedSteps = Object.fromEntries(
    completedStepIds.map(
      (stepId, index) => [
        stepId,
        `2026-08-24T07:0${index}:00.000Z`,
      ]
    )
  );

  return {
    id: `${id}@${localDate}`,
    routineId: id,
    localDate,
    timeZone: 'Europe/London',
    snapshot: occurrenceSnapshot,
    completedSteps,
    completedAt:
      completedStepIds.length ===
        occurrenceSnapshot.steps.length
        ? '2026-08-24T07:05:00.000Z'
        : null,
    updatedAt:
      '2026-08-24T07:05:00.000Z',
  };
}

const ALL_PAST_RANGE = {
  startDate: null,
  endDate: '2026-08-26',
};

describe('routine History & Progress', () => {
  it('derives Completed, Partial and Missed only from captured snapshot steps', () => {
    const completed = occurrence(
      'completed',
      '2026-08-24',
      'family',
      ['step-1', 'step-2', 'step-3']
    );
    const partial = occurrence(
      'partial',
      '2026-08-24',
      'family',
      ['step-2', 'removed-definition-step']
    );
    const missed = occurrence(
      'missed',
      '2026-08-24'
    );

    assert.equal(
      getRoutineHistoryOutcome(completed),
      'completed'
    );
    assert.equal(
      getRoutineHistoryOutcome(partial),
      'partial'
    );
    assert.equal(
      createRoutineHistoryItem(partial)
        .completedStepCount,
      1
    );
    assert.equal(
      getRoutineHistoryOutcome(missed),
      'missed'
    );
  });

  it('excludes today and does not fabricate a missing scheduled day', () => {
    const occurrences = [
      occurrence('monday', '2026-08-24'),
      occurrence('wednesday', '2026-08-26'),
      occurrence('today', '2026-08-27'),
    ];
    const selected = selectRoutineHistory({
      occurrences,
      profiles: PROFILES,
      selectedProfileId: 'family',
      householdToday: '2026-08-27',
      range: ALL_PAST_RANGE,
    });

    assert.deepEqual(
      selected.map(item => item.localDate),
      ['2026-08-26', '2026-08-24']
    );
    assert.equal(
      selected.some(
        item => item.localDate === '2026-08-25'
      ),
      false
    );
    assert.deepEqual(
      getRoutineHistoryMetrics(selected),
      {
        recorded: 2,
        completed: 0,
        partial: 0,
        missed: 2,
        recordedCompletionRate: 0,
      }
    );
  });

  it('builds historical presentation exclusively from the immutable snapshot', () => {
    const captured = occurrence(
      'routine-1',
      '2026-08-24',
      'adult-1',
      ['old-step'],
      {
        title: 'Old captured title',
        schedule: {
          daysOfWeek: [1],
          startTime: null,
          endTime: null,
        },
        steps: [
          { id: 'old-step', title: 'Old captured step' },
        ],
      }
    );
    const item = createRoutineHistoryItem(
      captured
    );

    assert.equal(item.title, 'Old captured title');
    assert.equal(item.ownerProfileId, 'adult-1');
    assert.deepEqual(item.schedule, {
      daysOfWeek: [1],
      startTime: null,
      endTime: null,
    });
    assert.deepEqual(item.steps, [
      { id: 'old-step', title: 'Old captured step' },
    ]);
    assert.equal(item.outcome, 'completed');
  });

  it('preserves Family and member visibility using snapshot assignment', () => {
    const occurrences = [
      occurrence('family-routine', '2026-08-24'),
      occurrence(
        'adult-routine',
        '2026-08-24',
        'adult-1'
      ),
      occurrence(
        'child-routine',
        '2026-08-24',
        'child-1'
      ),
      occurrence(
        'orphan-routine',
        '2026-08-24',
        'removed-1'
      ),
    ];

    assert.deepEqual(
      selectVisibleHistoryOccurrences({
        occurrences,
        profiles: PROFILES,
        selectedProfileId: 'family',
      }).map(item => item.routineId),
      [
        'family-routine',
        'adult-routine',
        'child-routine',
      ]
    );
    assert.deepEqual(
      selectVisibleHistoryOccurrences({
        occurrences,
        profiles: PROFILES,
        selectedProfileId: 'adult-1',
      }).map(item => item.routineId),
      ['family-routine', 'adult-routine']
    );
  });

  it('supports past 7-day, 30-day, all and custom household-calendar ranges', () => {
    assert.deepEqual(
      getRoutineHistoryRange(
        '2026-03-30',
        7
      ),
      {
        startDate: '2026-03-23',
        endDate: '2026-03-29',
      }
    );
    assert.deepEqual(
      getRoutineHistoryRange(
        '2026-03-30',
        30
      ),
      {
        startDate: '2026-02-28',
        endDate: '2026-03-29',
      }
    );
    assert.deepEqual(
      getRoutineHistoryRange(
        '2026-03-30',
        null
      ),
      {
        startDate: null,
        endDate: '2026-03-29',
      }
    );

    const custom = selectRoutineHistory({
      occurrences: [
        occurrence('before', '2026-03-23'),
        occurrence('start', '2026-03-24'),
        occurrence('end', '2026-03-26'),
        occurrence('after', '2026-03-27'),
      ],
      profiles: PROFILES,
      selectedProfileId: 'family',
      householdToday: '2026-03-30',
      range: {
        startDate: '2026-03-24',
        endDate: '2026-03-26',
      },
    });

    assert.deepEqual(
      custom.map(item => item.routineId),
      ['end', 'start']
    );
  });

  it('keeps date arithmetic stable across leap years, midnight and DST boundaries', () => {
    assert.equal(
      shiftLocalDate('2028-03-01', -1),
      '2028-02-29'
    );
    assert.equal(
      shiftLocalDate('2026-03-30', -1),
      '2026-03-29'
    );
    assert.equal(
      shiftLocalDate('2026-10-26', -1),
      '2026-10-25'
    );

    const instant =
      new Date('2026-03-29T23:30:00.000Z');

    assert.equal(
      getZonedDateInfo(
        instant,
        'Europe/London'
      ).localDate,
      '2026-03-30'
    );
    assert.equal(
      getZonedDateInfo(
        instant,
        'America/New_York'
      ).localDate,
      '2026-03-29'
    );
  });

  it('filters by routine and outcome without altering recorded metrics input', () => {
    const occurrences = [
      occurrence(
        'routine-a',
        '2026-08-26',
        'family',
        ['step-1', 'step-2', 'step-3']
      ),
      occurrence(
        'routine-a',
        '2026-08-25',
        'family',
        ['step-1']
      ),
      occurrence(
        'routine-b',
        '2026-08-24'
      ),
    ];
    const routineA = selectRoutineHistory({
      occurrences,
      profiles: PROFILES,
      selectedProfileId: 'family',
      householdToday: '2026-08-27',
      range: ALL_PAST_RANGE,
      routineId: 'routine-a',
    });
    const completedOnly = selectRoutineHistory({
      occurrences,
      profiles: PROFILES,
      selectedProfileId: 'family',
      householdToday: '2026-08-27',
      range: ALL_PAST_RANGE,
      routineId: 'routine-a',
      outcome: 'completed',
    });

    assert.deepEqual(
      getRoutineHistoryMetrics(routineA),
      {
        recorded: 2,
        completed: 1,
        partial: 1,
        missed: 0,
        recordedCompletionRate: 50,
      }
    );
    assert.deepEqual(
      completedOnly.map(item => item.localDate),
      ['2026-08-26']
    );
  });

  it('returns an undefined recorded completion rate for a zero denominator', () => {
    assert.deepEqual(
      getRoutineHistoryMetrics([]),
      {
        recorded: 0,
        completed: 0,
        partial: 0,
        missed: 0,
        recordedCompletionRate: null,
      }
    );
  });

  it('retains the legacy migration marker and explicit completion timestamp', () => {
    const migrated = occurrence(
      'legacy',
      '2026-08-24',
      'family',
      ['step-1', 'step-2', 'step-3'],
      { source: 'legacy-migration' }
    );
    const item = createRoutineHistoryItem(
      migrated
    );

    assert.equal(
      item.snapshotSource,
      'legacy-migration'
    );
    assert.equal(
      item.completedAt,
      migrated.completedAt
    );
  });

  it('does not mutate occurrences while viewing or filtering History', () => {
    const occurrences = [
      occurrence(
        'routine-1',
        '2026-08-24',
        'family',
        ['step-1']
      ),
    ];
    const before = JSON.stringify(occurrences);

    selectRoutineHistory({
      occurrences,
      profiles: PROFILES,
      selectedProfileId: 'family',
      householdToday: '2026-08-27',
      range: ALL_PAST_RANGE,
      outcome: 'partial',
    });

    assert.equal(
      JSON.stringify(occurrences),
      before
    );
  });

  it('isolates History loading failures as an empty History result', async () => {
    const result = await resolveRoutineHistoryLoad(
      async () => {
        throw new Error(
          'History service unavailable.'
        );
      }
    );

    assert.deepEqual(result, {
      occurrences: [],
      error: 'History service unavailable.',
    });
  });

  it('keeps History lazy, read-only and bounded in the Daily workspace', async () => {
    const [
      dailySource,
      historySource,
      serviceSource,
    ] = await Promise.all([
      readFile(
        new URL(
          '../../app/src/pages/Daily.tsx',
          import.meta.url
        ),
        'utf8'
      ),
      readFile(
        new URL(
          '../../app/src/components/routines/RoutineHistory/RoutineHistory.tsx',
          import.meta.url
        ),
        'utf8'
      ),
      readFile(
        new URL(
          '../../app/src/services/routineService.ts',
          import.meta.url
        ),
        'utf8'
      ),
    ]);

    assert.match(
      dailySource,
      /tab === 'history'/
    );
    assert.match(
      historySource,
      /INITIAL_VISIBLE_COUNT = 50/
    );
    assert.match(
      historySource,
      />\s*Show more\s*</
    );
    assert.match(
      serviceSource,
      /requestHousehold\('\/api\/routines'\)/
    );
    assert.doesNotMatch(
      serviceSource,
      /\/api\/routines\/history/
    );
  });
});
