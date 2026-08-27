import assert from 'node:assert/strict';
import {
  describe,
  it,
} from 'node:test';

import {
  getCompletedStepCount,
  getOccurrenceId,
  getOccurrenceRoutine,
  getRoutineTimeStatus,
  getZonedDateInfo,
  isRoutineComplete,
  isRoutineScheduledToday,
} from '../../app/src/routines/recurrence.ts';
import type {
  RoutineDefinition,
  RoutineOccurrence,
  RoutineOccurrenceSnapshot,
} from '../../app/src/types/routine.ts';

const ROUTINE: RoutineDefinition = {
  id: 'routine-1',
  title: 'Morning preparation',
  ownerProfileId: 'family',
  active: true,
  schedule: {
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: '07:00',
    endTime: '08:00',
  },
  steps: [
    { id: 'step-1', title: 'First step' },
    { id: 'step-2', title: 'Second step' },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function snapshot(
  overrides: Partial<RoutineOccurrenceSnapshot> = {}
): RoutineOccurrenceSnapshot {
  return {
    title: ROUTINE.title,
    ownerProfileId: ROUTINE.ownerProfileId,
    schedule: structuredClone(ROUTINE.schedule),
    steps: structuredClone(ROUTINE.steps),
    definitionUpdatedAt: ROUTINE.updatedAt,
    capturedAt: '2026-08-31T06:00:00.000Z',
    source: 'captured',
    ...overrides,
  };
}

function occurrence(
  completedSteps: Record<string, string> = {},
  occurrenceSnapshot = snapshot()
): RoutineOccurrence {
  return {
    id: 'routine-1@2026-08-31',
    routineId: 'routine-1',
    localDate: '2026-08-31',
    timeZone: 'Europe/London',
    snapshot: occurrenceSnapshot,
    completedSteps,
    completedAt: null,
    updatedAt: '2026-08-31T07:11:00.000Z',
  };
}

const dateInfo = (
  minutesSinceMidnight: number
) => ({
  localDate: '2026-08-31',
  weekday: 1 as const,
  minutesSinceMidnight,
});

describe('routine recurrence and time awareness', () => {
  it('uses the configured household timezone instead of the browser or UTC date', () => {
    const instant =
      new Date('2026-08-30T23:30:00.000Z');

    assert.deepEqual(
      getZonedDateInfo(
        instant,
        'Europe/London'
      ),
      {
        localDate: '2026-08-31',
        weekday: 1,
        minutesSinceMidnight: 30,
      }
    );
    assert.deepEqual(
      getZonedDateInfo(
        instant,
        'America/New_York'
      ),
      {
        localDate: '2026-08-30',
        weekday: 7,
        minutesSinceMidnight: 19 * 60 + 30,
      }
    );
  });

  it('handles household midnight and the Europe/London DST jump', () => {
    assert.equal(
      getZonedDateInfo(
        new Date('2026-03-29T00:30:00.000Z'),
        'Europe/London'
      ).minutesSinceMidnight,
      30
    );
    assert.equal(
      getZonedDateInfo(
        new Date('2026-03-29T01:30:00.000Z'),
        'Europe/London'
      ).minutesSinceMidnight,
      150
    );
    assert.equal(
      getZonedDateInfo(
        new Date('2026-10-25T01:30:00.000Z'),
        'Europe/London'
      ).minutesSinceMidnight,
      90
    );
  });

  it('derives untimed routines as today until completed', () => {
    const untimed = {
      ...ROUTINE,
      schedule: {
        ...ROUTINE.schedule,
        startTime: null,
        endTime: null,
      },
    };

    assert.equal(
      getRoutineTimeStatus(
        untimed,
        undefined,
        dateInfo(12 * 60)
      ),
      'today'
    );
  });

  it('derives start-only boundaries without creating an overdue state', () => {
    const startOnly = {
      ...ROUTINE,
      schedule: {
        ...ROUTINE.schedule,
        endTime: null,
      },
    };

    assert.equal(
      getRoutineTimeStatus(
        startOnly,
        undefined,
        dateInfo(6 * 60 + 59)
      ),
      'upcoming'
    );
    assert.equal(
      getRoutineTimeStatus(
        startOnly,
        undefined,
        dateInfo(7 * 60)
      ),
      'due'
    );
    assert.equal(
      getRoutineTimeStatus(
        startOnly,
        undefined,
        dateInfo(23 * 60 + 59)
      ),
      'due'
    );
  });

  it('keeps start/end routines due through the exact end minute', () => {
    assert.equal(
      getRoutineTimeStatus(
        ROUTINE,
        undefined,
        dateInfo(6 * 60 + 59)
      ),
      'upcoming'
    );
    assert.equal(
      getRoutineTimeStatus(
        ROUTINE,
        undefined,
        dateInfo(7 * 60)
      ),
      'due'
    );
    assert.equal(
      getRoutineTimeStatus(
        ROUTINE,
        undefined,
        dateInfo(8 * 60)
      ),
      'due'
    );
    assert.equal(
      getRoutineTimeStatus(
        ROUTINE,
        undefined,
        dateInfo(8 * 60 + 1)
      ),
      'overdue'
    );
  });

  it('keeps partial routines in their time state and lets completion override it', () => {
    const partial = occurrence({
      'step-1': '2026-08-31T07:10:00.000Z',
    });
    const complete = occurrence({
      'step-1': '2026-08-31T07:10:00.000Z',
      'step-2': '2026-08-31T07:11:00.000Z',
    });

    assert.equal(
      getCompletedStepCount(ROUTINE, partial),
      1
    );
    assert.equal(
      getRoutineTimeStatus(
        ROUTINE,
        partial,
        dateInfo(7 * 60 + 30)
      ),
      'due'
    );
    assert.equal(
      getRoutineTimeStatus(
        ROUTINE,
        complete,
        dateInfo(9 * 60)
      ),
      'completed'
    );
  });

  it('uses immutable snapshot steps, title, assignment and schedule', () => {
    const captured = occurrence(
      {
        'step-1': '2026-08-31T07:10:00.000Z',
        'step-2': '2026-08-31T07:11:00.000Z',
      },
      snapshot()
    );
    const editedDefinition: RoutineDefinition = {
      ...ROUTINE,
      title: 'Renamed tomorrow',
      ownerProfileId: 'adult-1',
      schedule: {
        daysOfWeek: [7],
        startTime: '20:00',
        endTime: '21:00',
      },
      steps: [
        { id: 'new-step', title: 'New step' },
      ],
      updatedAt: '2026-08-31T09:00:00.000Z',
    };
    const display = getOccurrenceRoutine(
      editedDefinition,
      captured
    );

    assert.equal(display.title, ROUTINE.title);
    assert.equal(display.ownerProfileId, 'family');
    assert.deepEqual(display.schedule, ROUTINE.schedule);
    assert.deepEqual(display.steps, ROUTINE.steps);
    assert.equal(
      isRoutineComplete(
        editedDefinition,
        captured
      ),
      true
    );
    assert.equal(
      isRoutineScheduledToday(
        editedDefinition,
        dateInfo(7 * 60),
        captured
      ),
      true
    );
  });

  it('uses stable date-derived occurrence IDs', () => {
    assert.equal(
      getOccurrenceId(
        'routine-1',
        '2026-08-31'
      ),
      'routine-1@2026-08-31'
    );
    assert.equal(
      getOccurrenceId(
        'routine-1',
        '2026-09-01'
      ),
      'routine-1@2026-09-01'
    );
  });
});
