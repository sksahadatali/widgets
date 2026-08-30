import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  selectActiveLists,
  selectShoppingList,
} from '../../app/src/lists/listSelectors.ts';
import type { FamilyListStoreData } from '../../app/src/types/familyList.ts';

const store: FamilyListStoreData = {
  schemaVersion: 1,
  lists: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      systemKey: 'shopping',
      name: 'Groceries',
      active: true,
      items: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: '11111111-1111-4111-8111-111111111111',
      systemKey: null,
      name: 'Archived',
      active: false,
      items: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

describe('Family Lists selectors', () => {
  it('returns the same shared active lists for Family, adult and child contexts', () => {
    for (const _profileId of ['family', 'adult-1', 'child-1']) {
      assert.deepEqual(selectActiveLists(store).map(list => list.name), ['Groceries']);
    }
  });

  it('finds Shopping by immutable system key after rename', () => {
    assert.equal(selectShoppingList(store).name, 'Groceries');
  });
});
