import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createMealCalendarState,
  getHouseholdToday,
  getMealWindowDates,
  isValidLocalDate,
  refreshMealHouseholdToday,
  selectCurrentMealWindow,
  shiftMealLocalDate,
} from '../../app/src/meals/mealDates.ts';

describe('Meal civil dates and household time', () => {
  it('validates real Gregorian dates including leap days', () => {
    assert.equal(isValidLocalDate('2024-02-29'), true);
    assert.equal(isValidLocalDate('2026-02-29'), false);
    assert.equal(isValidLocalDate('2026-02-30'), false);
    assert.equal(isValidLocalDate('2026-13-01'), false);
    assert.equal(isValidLocalDate('26-08-31'), false);
  });

  it('starts the default window at household Today', () => {
    assert.deepEqual(
      createMealCalendarState(
        new Date('2026-08-30T23:30:00.000Z'),
        'Europe/London'
      ),
      {
        householdToday: '2026-08-31',
        selectedWindowStart: '2026-08-31',
      }
    );
  });

  it('returns exactly seven consecutive dates across a month boundary', () => {
    assert.deepEqual(
      getMealWindowDates('2026-08-30'),
      [
        '2026-08-30',
        '2026-08-31',
        '2026-09-01',
        '2026-09-02',
        '2026-09-03',
        '2026-09-04',
        '2026-09-05',
      ]
    );
  });

  it('keeps consecutive windows correct across year and leap-year boundaries', () => {
    assert.deepEqual(
      getMealWindowDates('2025-12-29'),
      [
        '2025-12-29',
        '2025-12-30',
        '2025-12-31',
        '2026-01-01',
        '2026-01-02',
        '2026-01-03',
        '2026-01-04',
      ]
    );
    assert.deepEqual(
      getMealWindowDates('2024-02-27'),
      [
        '2024-02-27',
        '2024-02-28',
        '2024-02-29',
        '2024-03-01',
        '2024-03-02',
        '2024-03-03',
        '2024-03-04',
      ]
    );
  });

  it('uses the household timezone across a UTC date boundary', () => {
    const instant = new Date('2026-08-30T23:30:00.000Z');
    assert.equal(
      getHouseholdToday(instant, 'Europe/London'),
      '2026-08-31'
    );
    assert.equal(
      getHouseholdToday(instant, 'America/New_York'),
      '2026-08-30'
    );
  });

  it('keeps civil dates stable through both Europe/London DST transitions', () => {
    assert.equal(
      getHouseholdToday(
        new Date('2026-03-29T00:30:00.000Z'),
        'Europe/London'
      ),
      '2026-03-29'
    );
    assert.equal(
      getHouseholdToday(
        new Date('2026-03-29T23:30:00.000Z'),
        'Europe/London'
      ),
      '2026-03-30'
    );
    assert.equal(
      getHouseholdToday(
        new Date('2026-10-25T01:30:00.000Z'),
        'Europe/London'
      ),
      '2026-10-25'
    );
  });

  it('moves Previous and Next by exactly seven calendar days', () => {
    assert.equal(
      shiftMealLocalDate('2026-08-30', -7),
      '2026-08-23'
    );
    assert.equal(
      shiftMealLocalDate('2026-08-30', 7),
      '2026-09-06'
    );
  });

  it('refreshes householdToday without hijacking a navigated window', () => {
    const navigated = {
      householdToday: '2026-08-30',
      selectedWindowStart: '2026-08-16',
    };
    const refreshed = refreshMealHouseholdToday(
      navigated,
      new Date('2026-08-31T12:00:00.000Z'),
      'Europe/London'
    );
    assert.deepEqual(refreshed, {
      householdToday: '2026-08-31',
      selectedWindowStart: '2026-08-16',
    });
    assert.equal(
      selectCurrentMealWindow(refreshed).selectedWindowStart,
      '2026-08-31'
    );
  });

  it('rolls a still-current Today window across household midnight', () => {
    assert.deepEqual(
      refreshMealHouseholdToday(
        {
          householdToday: '2026-08-30',
          selectedWindowStart: '2026-08-30',
        },
        new Date('2026-08-31T12:00:00.000Z'),
        'Europe/London'
      ),
      {
        householdToday: '2026-08-31',
        selectedWindowStart: '2026-08-31',
      }
    );
  });
});
