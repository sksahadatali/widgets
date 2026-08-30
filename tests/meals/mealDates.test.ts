import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createMealCalendarState,
  getHouseholdToday,
  getMealWeekDates,
  getMealWeekStart,
  isMondayLocalDate,
  isValidLocalDate,
  refreshMealHouseholdToday,
  selectCurrentMealWeek,
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

  it('derives Monday-Sunday weeks across month and year boundaries', () => {
    assert.equal(getMealWeekStart('2026-01-01'), '2025-12-29');
    assert.deepEqual(
      getMealWeekDates('2025-12-29'),
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
    assert.equal(isMondayLocalDate('2025-12-29'), true);
    assert.equal(isMondayLocalDate('2026-01-01'), false);
    assert.equal(shiftMealLocalDate('2024-02-28', 1), '2024-02-29');
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

  it('refreshes householdToday without hijacking the selected week', () => {
    const navigated = {
      householdToday: '2026-08-30',
      selectedWeekStart: '2026-08-10',
    };
    const refreshed = refreshMealHouseholdToday(
      navigated,
      new Date('2026-08-31T12:00:00.000Z'),
      'Europe/London'
    );
    assert.deepEqual(refreshed, {
      householdToday: '2026-08-31',
      selectedWeekStart: '2026-08-10',
    });
    assert.equal(
      selectCurrentMealWeek(refreshed).selectedWeekStart,
      '2026-08-31'
    );
    assert.deepEqual(
      createMealCalendarState(
        new Date('2026-08-30T23:30:00.000Z'),
        'Europe/London'
      ),
      {
        householdToday: '2026-08-31',
        selectedWeekStart: '2026-08-31',
      }
    );
  });
});
