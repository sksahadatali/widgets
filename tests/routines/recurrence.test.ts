import assert from 'node:assert/strict';
import {
  describe,
  it,
} from 'node:test';

import {
  getOccurrenceId,
  getRoutineWindowState,
  getZonedDateInfo,
  isRoutineComplete,
  isRoutineScheduledToday,
} from '../../app/src/routines/recurrence.ts';
import type {
  RoutineDefinition,
  RoutineOccurrence,
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

describe('routine recurrence', () => {
  it('derives the household date and weekday using the configured timezone', () => {
    const london = getZonedDateInfo(
      new Date('2026-08-30T23:30:00.000Z'),
      'Europe/London'
    );
    const newYork = getZonedDateInfo(
      new Date('2026-08-30T23:30:00.000Z'),
      'America/New_York'
    );

    assert.deepEqual(london, {
      localDate: '2026-08-31',
      weekday: 1,
      minutesSinceMidnight: 30,
    });
    assert.deepEqual(newYork, {
      localDate: '2026-08-30',
      weekday: 7,
      minutesSinceMidnight: 19 * 60 + 30,
    });
  });

  it('determines schedule applicability without a reset timer', () => {
    assert.equal(
      isRoutineScheduledToday(
        ROUTINE,
        {
          localDate: '2026-08-31',
          weekday: 1,
          minutesSinceMidnight: 7 * 60,
        }
      ),
      true
    );

    assert.equal(
      isRoutineScheduledToday(
        ROUTINE,
        {
          localDate: '2026-08-30',
          weekday: 7,
          minutesSinceMidnight: 7 * 60,
        }
      ),
      false
    );
  });

  it('reports upcoming, current and overdue window states', () => {
    assert.equal(
      getRoutineWindowState(
        ROUTINE,
        undefined,
        {
          localDate: '2026-08-31',
          weekday: 1,
          minutesSinceMidnight: 6 * 60 + 59,
        }
      ),
      'upcoming'
    );
    assert.equal(
      getRoutineWindowState(
        ROUTINE,
        undefined,
        {
          localDate: '2026-08-31',
          weekday: 1,
          minutesSinceMidnight: 7 * 60 + 30,
        }
      ),
      'current'
    );
    assert.equal(
      getRoutineWindowState(
        ROUTINE,
        undefined,
        {
          localDate: '2026-08-31',
          weekday: 1,
          minutesSinceMidnight: 8 * 60 + 1,
        }
      ),
      'overdue'
    );
  });

  it('uses stable date-derived occurrence IDs and current step IDs', () => {
    const occurrence: RoutineOccurrence = {
      id: 'routine-1@2026-08-31',
      routineId: 'routine-1',
      localDate: '2026-08-31',
      timeZone: 'Europe/London',
      completedSteps: {
        'step-1': '2026-08-31T07:10:00.000Z',
        'old-step': '2026-08-31T07:11:00.000Z',
      },
      completedAt: null,
      updatedAt: '2026-08-31T07:11:00.000Z',
    };

    assert.equal(
      getOccurrenceId('routine-1', '2026-08-31'),
      'routine-1@2026-08-31'
    );
    assert.equal(
      getOccurrenceId('routine-1', '2026-09-01'),
      'routine-1@2026-09-01'
    );
    assert.equal(
      isRoutineComplete(ROUTINE, occurrence),
      false
    );

    occurrence.completedSteps['step-2'] =
      '2026-08-31T07:12:00.000Z';
    assert.equal(
      isRoutineComplete(ROUTINE, occurrence),
      true
    );
  });
});
