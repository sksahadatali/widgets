import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DemoMealPlanStore,
  validateDemoMealPlanStore,
} from '../../app/src/meals/demoMealPlanStore.ts';

const ENTRY_ONE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ENTRY_TWO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW = new Date('2026-08-30T09:00:00.000Z');
const LATER = new Date('2026-08-30T10:00:00.000Z');

describe('Demo Meal Planning', () => {
  it('uses safe current-week-relative synthetic meals', () => {
    const demo = new DemoMealPlanStore(
      undefined,
      NOW,
      'Europe/London'
    );
    const store = demo.read();
    assert.equal(store.schemaVersion, 1);
    assert.deepEqual(
      store.entries.map(entry => entry.title),
      [
        'Porridge',
        'Soup and sandwiches',
        'Vegetable pasta',
      ]
    );
    assert.deepEqual(
      store.entries.map(entry => entry.localDate),
      ['2026-08-24', '2026-08-26', '2026-08-28']
    );
    assert.doesNotThrow(
      () => validateDemoMealPlanStore(store)
    );
  });

  it('supports CRUD, duplicate titles, move, copy and reset parity', () => {
    const demo = new DemoMealPlanStore(
      { schemaVersion: 1, entries: [] }
    );
    demo.createEntry({
      id: ENTRY_ONE,
      localDate: '2026-08-31',
      mealType: 'breakfast',
      title: 'Toast',
    }, NOW);
    demo.createEntry({
      id: ENTRY_TWO,
      localDate: '2026-08-31',
      mealType: 'breakfast',
      title: 'Toast',
    }, LATER);
    demo.updateEntry(
      ENTRY_ONE,
      { title: 'Toast and fruit' },
      LATER
    );
    demo.updateEntry(
      ENTRY_ONE,
      {
        localDate: '2026-09-01',
        mealType: 'dinner',
      },
      LATER
    );
    const store = demo.read();
    assert.equal(store.entries.length, 2);
    assert.equal(store.entries[0].id, ENTRY_TWO);
    assert.deepEqual(
      store.entries[1],
      {
        id: ENTRY_ONE,
        localDate: '2026-09-01',
        mealType: 'dinner',
        title: 'Toast and fruit',
        createdAt: NOW.toISOString(),
        updatedAt: LATER.toISOString(),
      }
    );
    assert.equal(demo.removeEntry(ENTRY_TWO), true);
    assert.equal(demo.removeEntry(ENTRY_TWO), false);

    const fresh = new DemoMealPlanStore(
      undefined,
      NOW,
      'Europe/London'
    );
    assert.equal(fresh.read().entries.length, 3);
  });

  it('makes equivalent creates and patches no-ops and rejects partial moves', () => {
    const demo = new DemoMealPlanStore(
      { schemaVersion: 1, entries: [] }
    );
    const input = {
      id: ENTRY_ONE,
      localDate: '2026-08-31',
      mealType: 'lunch' as const,
      title: 'Soup',
    };
    assert.equal(demo.createEntry(input, NOW).created, true);
    assert.equal(demo.createEntry(input, LATER).created, false);
    assert.equal(
      demo.updateEntry(
        ENTRY_ONE,
        { title: 'Soup' },
        LATER
      ).updatedAt,
      NOW.toISOString()
    );
    assert.throws(() => demo.updateEntry(
      ENTRY_ONE,
      { localDate: '2026-09-01' }
    ));
  });
});
