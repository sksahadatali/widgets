import assert from 'node:assert/strict';
import {
  describe,
  it,
} from 'node:test';

import {
  BrainRules,
} from '../../app/src/brain/brainRules.ts';
import {
  getBrainDecisionLogLabel,
} from '../../app/src/brain/logger.ts';
import {
  generateTodayFocus,
} from '../../app/src/brain/todayBrain.ts';
import type {
  BrainDecision,
  BrainInput,
} from '../../app/src/brain/types.ts';
import type {
  HouseholdProfile,
} from '../../app/src/household/householdProfiles.ts';
import {
  getZonedDateInfo,
  type ZonedDateInfo,
} from '../../app/src/routines/recurrence.ts';
import {
  selectRoutineAttentionCandidates,
  selectVisibleTodayRoutines,
  type RoutineAttentionCandidate,
} from '../../app/src/routines/routineSelectors.ts';
import type {
  CalendarEvent,
} from '../../app/src/services/calendarService.ts';
import type {
  PrayerData,
} from '../../app/src/services/prayerService.ts';
import type {
  FocusItem,
} from '../../app/src/types/focus.ts';
import type {
  RoutineDefinition,
  RoutineOccurrence,
} from '../../app/src/types/routine.ts';

const MONDAY: ZonedDateInfo = {
  localDate: '2026-08-31',
  weekday: 1,
  minutesSinceMidnight: 7 * 60 + 30,
};

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
  ownerProfileId = 'family',
  overrides: Partial<RoutineDefinition> = {}
): RoutineDefinition {
  return {
    id,
    title: `${id} definition`,
    ownerProfileId,
    active: true,
    schedule: {
      daysOfWeek: [1],
      startTime: '07:00',
      endTime: '08:00',
    },
    steps: [
      { id: `${id}-step-1`, title: 'First' },
      { id: `${id}-step-2`, title: 'Second' },
    ],
    createdAt: '2026-08-30T06:00:00.000Z',
    updatedAt: '2026-08-30T06:00:00.000Z',
    ...overrides,
  };
}

function occurrence(
  definition: RoutineDefinition,
  overrides: Partial<RoutineOccurrence> = {}
): RoutineOccurrence {
  return {
    id: `${definition.id}@${MONDAY.localDate}`,
    routineId: definition.id,
    localDate: MONDAY.localDate,
    timeZone: 'Europe/London',
    snapshot: {
      title: `${definition.id} captured`,
      ownerProfileId: definition.ownerProfileId,
      schedule: structuredClone(definition.schedule),
      steps: structuredClone(definition.steps),
      definitionUpdatedAt: definition.updatedAt,
      capturedAt: '2026-08-31T06:00:00.000Z',
      source: 'captured',
    },
    completedSteps: {},
    completedAt: null,
    updatedAt: '2026-08-31T06:00:00.000Z',
    ...overrides,
  };
}

function attention(
  id: string,
  status: RoutineAttentionCandidate['status'],
  overrides: Partial<RoutineAttentionCandidate> = {}
): RoutineAttentionCandidate {
  const startTime = status === 'today'
    ? null
    : '09:00';
  const endTime =
    status === 'today' ||
    status === 'upcoming'
      ? null
      : '10:00';

  return {
    routineId: id,
    occurrenceId: `${id}@2026-08-31`,
    title: id,
    ownerProfileId: 'family',
    localDate: '2026-08-31',
    status,
    displayStatus:
      status === 'today'
        ? 'Today'
        : status === 'upcoming'
          ? 'Upcoming'
          : status === 'due'
            ? 'Due'
            : 'Overdue',
    startTime,
    endTime,
    minutesUntilStart:
      status === 'upcoming' ? 90 : null,
    completedSteps: 0,
    totalSteps: 3,
    ...overrides,
  };
}

function task(
  id: string,
  overrides: Partial<FocusItem> = {}
): FocusItem {
  return {
    id,
    title: id,
    category: 'work',
    priority: 'medium',
    status: 'pending',
    dueDate: '2026-08-31',
    dueTime: null,
    estimatedMinutes: 30,
    assignedTo: 'You',
    ...overrides,
  };
}

function brainInput(
  overrides: Partial<BrainInput> = {}
): BrainInput {
  return {
    focusItems: [],
    calendarEvents: [],
    prayer: null,
    weather: null,
    weatherInsights: [],
    routineCandidates: [],
    ...overrides,
  };
}

function prayer(
  overrides: Partial<PrayerData> = {}
): PrayerData {
  return {
    name: 'Fajr',
    time: '07:45',
    dateTime: '2026-08-31T07:45:00.000Z',
    minutesRemaining: 15,
    isDueSoon: true,
    isCurrentPrayer: false,
    timeRemaining: 'In 15m',
    timings: {
      Fajr: '07:45',
      Sunrise: '08:30',
      Dhuhr: '13:00',
      Asr: '17:00',
      Maghrib: '20:00',
      Isha: '21:30',
    },
    hijriDate: 'Example 1, 1448',
    ...overrides,
  };
}

describe('routine attention selector', () => {
  it('uses immutable occurrence snapshots and preserves Family/member visibility', () => {
    const family = routine('family-routine');
    const adult = routine('adult-routine', 'adult-1');
    const child = routine('child-routine', 'child-1');
    const orphan = routine('orphan-routine', 'removed-1');
    const definitions = [
      family,
      adult,
      child,
      orphan,
    ];
    const occurrences = new Map(
      definitions.map(definition => [
        definition.id,
        occurrence(definition),
      ])
    );
    family.title = 'Edited after materialisation';
    family.ownerProfileId = 'child-1';
    family.steps = [
      { id: 'replacement', title: 'Replacement' },
    ];

    const familyVisible =
      selectVisibleTodayRoutines({
        routines: definitions,
        occurrenceByRoutineId: occurrences,
        profiles: PROFILES,
        selectedProfileId: 'family',
        dateInfo: MONDAY,
      });
    const adultVisible =
      selectVisibleTodayRoutines({
        routines: definitions,
        occurrenceByRoutineId: occurrences,
        profiles: PROFILES,
        selectedProfileId: 'adult-1',
        dateInfo: MONDAY,
      });
    const familyCandidates =
      selectRoutineAttentionCandidates({
        routines: familyVisible,
        occurrenceByRoutineId: occurrences,
        dateInfo: MONDAY,
      });

    assert.deepEqual(
      familyVisible.map(item => item.id),
      ['family-routine', 'adult-routine', 'child-routine']
    );
    assert.deepEqual(
      adultVisible.map(item => item.id),
      ['family-routine', 'adult-routine']
    );
    assert.equal(
      familyCandidates[0].title,
      'family-routine captured'
    );
    assert.equal(
      familyCandidates[0].ownerProfileId,
      'family'
    );
    assert.equal(familyCandidates[0].totalSteps, 2);
  });

  it('excludes completed, inactive, unscheduled and non-materialised routines', () => {
    const complete = routine('complete');
    const inactive = routine('inactive', 'family', {
      active: false,
    });
    const unscheduled = routine('unscheduled', 'family', {
      schedule: {
        daysOfWeek: [2],
        startTime: null,
        endTime: null,
      },
    });
    const missing = routine('missing');
    const completeOccurrence = occurrence(complete, {
      completedSteps: {
        'complete-step-1': '2026-08-31T07:10:00.000Z',
        'complete-step-2': '2026-08-31T07:11:00.000Z',
      },
      completedAt: '2026-08-31T07:11:00.000Z',
    });
    const occurrences = new Map([
      [complete.id, completeOccurrence],
      [inactive.id, occurrence(inactive)],
      [unscheduled.id, occurrence(unscheduled)],
    ]);

    assert.deepEqual(
      selectRoutineAttentionCandidates({
        routines: [
          complete,
          inactive,
          unscheduled,
          missing,
        ],
        occurrenceByRoutineId: occurrences,
        dateInfo: MONDAY,
      }),
      []
    );
  });

  it('re-enters as In progress when a completed step is reopened', () => {
    const definition = routine('reopen');
    const completed = occurrence(definition, {
      completedSteps: {
        'reopen-step-1': '2026-08-31T07:10:00.000Z',
        'reopen-step-2': '2026-08-31T07:11:00.000Z',
      },
      completedAt: '2026-08-31T07:11:00.000Z',
    });
    const occurrences = new Map([
      [definition.id, completed],
    ]);

    assert.equal(
      selectRoutineAttentionCandidates({
        routines: [definition],
        occurrenceByRoutineId: occurrences,
        dateInfo: MONDAY,
      }).length,
      0
    );

    delete completed.completedSteps['reopen-step-2'];
    completed.completedAt = null;
    const reopened =
      selectRoutineAttentionCandidates({
        routines: [definition],
        occurrenceByRoutineId: occurrences,
        dateInfo: MONDAY,
      });

    assert.equal(reopened[0].displayStatus, 'In progress');
    assert.equal(reopened[0].completedSteps, 1);
  });

  it('uses household timezone and DST-derived date information without mutating the store', () => {
    const definition = routine('dst', 'family', {
      schedule: {
        daysOfWeek: [7],
        startTime: '02:45',
        endTime: '03:30',
      },
    });
    const dateInfo = getZonedDateInfo(
      new Date('2026-03-29T01:30:00.000Z'),
      'Europe/London'
    );
    const captured = occurrence(definition, {
      id: 'dst@2026-03-29',
      localDate: '2026-03-29',
      snapshot: {
        ...occurrence(definition).snapshot,
        schedule: structuredClone(definition.schedule),
      },
    });
    const input = {
      routines: [definition],
      occurrences: [captured],
      schemaVersion: 2,
    };
    const before = structuredClone(input);
    const candidates =
      selectRoutineAttentionCandidates({
        routines: input.routines,
        occurrenceByRoutineId: new Map([
          [definition.id, captured],
        ]),
        dateInfo,
      });

    assert.deepEqual(dateInfo, {
      localDate: '2026-03-29',
      weekday: 7,
      minutesSinceMidnight: 2 * 60 + 30,
    });
    assert.equal(candidates[0].status, 'upcoming');
    assert.equal(candidates[0].minutesUntilStart, 15);
    assert.deepEqual(input, before);
  });
});

describe('routine candidates in Today Brain', () => {
  const now = new Date('2026-08-31T07:30:00.000Z');

  it('uses the approved exact routine scores', () => {
    const cases: Array<[
      RoutineAttentionCandidate,
      number,
    ]> = [
      [attention('overdue', 'overdue'), BrainRules.ROUTINE.OVERDUE],
      [attention('progress', 'due', {
        displayStatus: 'In progress',
        completedSteps: 1,
      }), BrainRules.ROUTINE.IN_PROGRESS],
      [attention('due', 'due'), BrainRules.ROUTINE.DUE],
      [attention('upcoming', 'upcoming'), BrainRules.ROUTINE.UPCOMING],
      [attention('today', 'today'), BrainRules.ROUTINE.TODAY],
    ];

    cases.forEach(([candidate, expectedScore]) => {
      const result = generateTodayFocus(
        brainInput({
          routineCandidates: [candidate],
        }),
        now
      );

      assert.equal(result.decisions[0].score, expectedScore);
    });
  });

  it('includes the 120-minute boundary and excludes 121 minutes', () => {
    const result = generateTodayFocus(
      brainInput({
        routineCandidates: [
          attention('included', 'upcoming', {
            minutesUntilStart: 120,
          }),
          attention('excluded', 'upcoming', {
            minutesUntilStart: 121,
          }),
        ],
      }),
      now
    );

    assert.deepEqual(
      result.decisions.map(decision => decision.item.title),
      ['included']
    );
  });

  it('admits at most three routines and keeps the overall four-item limit in mixed ranking', () => {
    const result = generateTodayFocus(
      brainInput({
        prayer: prayer(),
        routineCandidates: [
          attention('overdue', 'overdue'),
          attention('progress', 'due', {
            displayStatus: 'In progress',
            completedSteps: 2,
          }),
          attention('due', 'due'),
          attention('upcoming', 'upcoming'),
          attention('today', 'today'),
        ],
      }),
      now
    );

    assert.equal(result.decisions.length, 4);
    assert.equal(
      result.decisions.filter(
        decision => decision.source === 'routine'
      ).length,
      3
    );
    assert.deepEqual(
      result.decisions.map(decision => [
        decision.source,
        decision.score,
      ]),
      [
        ['routine', 145],
        ['routine', 135],
        ['prayer', 130],
        ['routine', 125],
      ]
    );
  });

  it('ranks routine signals against existing Task and Calendar sources', () => {
    const currentEvent: CalendarEvent = {
      id: 'event-1',
      title: 'Current appointment',
      start: '2026-08-31T07:00:00.000Z',
      end: '2026-08-31T08:00:00.000Z',
      allDay: false,
      location: '',
      description: '',
      calendarUrl: 'https://example.invalid/calendar',
    };
    const result = generateTodayFocus(
      brainInput({
        focusItems: [
          task('High overdue task', {
            priority: 'high',
            dueDate: '2026-08-30',
          }),
        ],
        calendarEvents: [currentEvent],
        routineCandidates: [
          attention('Overdue routine', 'overdue'),
          attention('In progress routine', 'due', {
            displayStatus: 'In progress',
            completedSteps: 1,
          }),
        ],
      }),
      now
    );

    assert.deepEqual(
      result.decisions.map(decision => [
        decision.source,
        decision.score,
      ]),
      [
        ['routine', 145],
        ['calendar', 140],
        ['focus', 140],
        ['routine', 135],
      ]
    );
  });

  it('deduplicates routines by occurrence identity rather than title', () => {
    const duplicateOccurrence = attention(
      'first-copy',
      'overdue',
      {
        occurrenceId: 'first@2026-08-31',
        title: 'Duplicate copy',
      }
    );
    const result = generateTodayFocus(
      brainInput({
        routineCandidates: [
          attention('first', 'today', {
            title: 'Shared title',
          }),
          attention('second', 'today', {
            title: 'Shared title',
          }),
          duplicateOccurrence,
        ],
      }),
      now
    );

    assert.equal(result.decisions.length, 2);
    assert.notEqual(
      result.decisions[0].item.id,
      result.decisions[1].item.id
    );
    assert.equal(
      result.decisions.filter(
        decision =>
          decision.item.id ===
          'routine-first@2026-08-31'
      ).length,
      1
    );
  });

  it('degrades to existing sources when routine candidates are unavailable', () => {
    const result = generateTodayFocus(
      brainInput({
        focusItems: [task('Existing task')],
        routineCandidates: [],
      }),
      now
    );

    assert.deepEqual(result.sources, ['focus']);
    assert.equal(result.items[0].title, 'Existing task');
  });

  it('redacts routine titles from development Brain labels', () => {
    const decision: BrainDecision = {
      item: task('Private household title'),
      source: 'routine',
      score: 145,
      reasons: ['Household routine'],
    };
    const label = getBrainDecisionLogLabel(decision);

    assert.equal(label, '[Household routine]');
    assert.equal(label.includes('Private household title'), false);
  });
});
