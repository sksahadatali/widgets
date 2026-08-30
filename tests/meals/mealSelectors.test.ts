import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MEAL_TYPES,
  selectMealActionDates,
  selectMealPlanWindow,
} from '../../app/src/meals/mealSelectors.ts';
import type {
  MealPlanEntry,
} from '../../app/src/types/mealPlan.ts';

const NOW = '2026-08-31T08:00:00.000Z';

function entry(
  id: string,
  localDate: string,
  mealType: MealPlanEntry['mealType'],
  title: string
): MealPlanEntry {
  return {
    id,
    localDate,
    mealType,
    title,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('Meal rolling-window selectors', () => {
  it('returns the selected seven dates and three frozen meal types', () => {
    const days = selectMealPlanWindow(
      [],
      '2026-08-30',
      '2026-09-01'
    );
    assert.equal(days.length, 7);
    assert.deepEqual(
      days.map(day => day.localDate),
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
    assert.deepEqual(
      Object.keys(days[0].entries),
      MEAL_TYPES
    );
    assert.equal(days[2].isToday, true);
  });

  it('preserves authoritative array order and never profile-filters', () => {
    const entries = [
      entry('1', '2026-08-31', 'breakfast', 'Porridge'),
      entry('2', '2026-09-01', 'dinner', 'Pasta'),
      entry('3', '2026-08-31', 'breakfast', 'Toast'),
    ];
    const days = selectMealPlanWindow(
      entries,
      '2026-08-31',
      '2026-08-31'
    );
    assert.deepEqual(
      days[0].entries.breakfast.map(item => item.title),
      ['Porridge', 'Toast']
    );
    assert.deepEqual(
      days[1].entries.dinner.map(item => item.title),
      ['Pasta']
    );
  });

  it('uses the selected rolling window for Move and Copy targets', () => {
    assert.deepEqual(
      selectMealActionDates('2026-12-29'),
      [
        '2026-12-29',
        '2026-12-30',
        '2026-12-31',
        '2027-01-01',
        '2027-01-02',
        '2027-01-03',
        '2027-01-04',
      ]
    );
  });
});
