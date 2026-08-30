import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DemoFamilyListStore,
  validateDemoFamilyListStore,
} from '../../app/src/lists/demoListStore.ts';

const LIST_ID = '44444444-4444-4444-8444-444444444444';
const ITEM_ID = '55555555-5555-4555-8555-555555555555';

describe('Demo Family Lists', () => {
  it('loads only the safe synthetic schema-v1 fixture', () => {
    const store = new DemoFamilyListStore().read();
    assert.equal(store.schemaVersion, 1);
    assert.equal(store.lists.length, 1);
    assert.equal(store.lists[0].systemKey, 'shopping');
    assert.deepEqual(
      store.lists[0].items.map(item => item.title),
      ['Milk', 'Bread', 'Bananas']
    );
    assert.doesNotThrow(() => validateDemoFamilyListStore(store));
  });

  it('supports the Phase 1 mutations in memory and resets in a fresh instance', () => {
    const demo = new DemoFamilyListStore();
    const shoppingId = demo.read().lists[0].id;
    demo.createList({ id: LIST_ID, name: 'Packing' });
    demo.renameList(LIST_ID, 'Holiday Packing');
    demo.reorderLists([LIST_ID, shoppingId]);
    demo.createItem(LIST_ID, {
      id: ITEM_ID,
      title: 'Passports',
      addedByProfileId: 'child-1',
    });
    demo.editItem(LIST_ID, ITEM_ID, 'Passports × 2');
    demo.setItemChecked(LIST_ID, ITEM_ID, true);
    assert.equal(demo.read().lists[0].items[0].checkedAt !== null, true);
    assert.equal(demo.clearChecked(LIST_ID), 1);
    demo.setListActive(LIST_ID, false);
    assert.equal(demo.read().lists[0].active, false);

    const fresh = new DemoFamilyListStore().read();
    assert.equal(fresh.lists.length, 1);
    assert.equal(fresh.lists[0].name, 'Shopping');
  });

  it('uses desired-state/idempotent operations and rejects stale reorders', () => {
    const demo = new DemoFamilyListStore();
    const shoppingId = demo.read().lists[0].id;
    demo.createItem(shoppingId, {
      id: ITEM_ID,
      title: 'Milk',
      addedByProfileId: 'removed-profile',
    });
    demo.createItem(shoppingId, {
      id: ITEM_ID,
      title: 'Milk',
      addedByProfileId: 'removed-profile',
    });
    demo.setItemChecked(shoppingId, ITEM_ID, true);
    const checkedAt = demo.read().lists[0].items.at(-1)?.checkedAt;
    demo.setItemChecked(shoppingId, ITEM_ID, true);
    assert.equal(demo.read().lists[0].items.at(-1)?.checkedAt, checkedAt);
    assert.throws(() => demo.reorderItems(shoppingId, [ITEM_ID]));
  });
});
