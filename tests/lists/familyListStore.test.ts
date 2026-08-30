import assert from 'node:assert/strict';
import {
  copyFile,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  FamilyListConflictError,
  FamilyListFileStore,
  FamilyListStoreCorruptError,
  SHOPPING_LIST_ID,
  validateFamilyListStore,
} from '../../server/src/services/familyListStore.ts';

const LIST_ONE = '11111111-1111-4111-8111-111111111111';
const LIST_TWO = '22222222-2222-4222-8222-222222222222';
const LIST_THREE = '33333333-3333-4333-8333-333333333333';
const ITEM_ONE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_TWO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ITEM_THREE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NOW = new Date('2026-08-29T09:00:00.000Z');
const LATER = new Date('2026-08-29T10:00:00.000Z');
const temporaryDirectories: string[] = [];

async function makeStore() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ey-lists-'));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, 'lists.local.json');
  return {
    directory,
    filePath,
    store: new FamilyListFileStore(filePath),
  };
}

const itemInput = (
  id: string,
  title: string,
  addedByProfileId = 'family'
) => ({ id, title, addedByProfileId });

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe('FamilyListFileStore persistence and validation', () => {
  it('initializes and reloads schema v1 with exactly one Shopping system list', async () => {
    const { filePath, store } = await makeStore();
    const initial = await store.read(NOW);
    assert.equal(initial.schemaVersion, 1);
    assert.equal(initial.lists.length, 1);
    assert.deepEqual(initial.lists[0], {
      id: SHOPPING_LIST_ID,
      systemKey: 'shopping',
      name: 'Shopping',
      active: true,
      items: [],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    assert.deepEqual(
      await new FamilyListFileStore(filePath).read(LATER),
      initial
    );
  });

  it('rejects malformed schemas, missing Shopping and duplicate identities', () => {
    const timestamp = NOW.toISOString();
    const shopping = {
      id: SHOPPING_LIST_ID,
      systemKey: 'shopping',
      name: 'Shopping',
      active: true,
      items: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    assert.throws(
      () => validateFamilyListStore({ schemaVersion: 2, lists: [shopping] }),
      FamilyListStoreCorruptError
    );
    assert.throws(
      () => validateFamilyListStore({ schemaVersion: 1, lists: [] }),
      FamilyListStoreCorruptError
    );
    assert.throws(
      () => validateFamilyListStore({
        schemaVersion: 1,
        lists: [shopping, { ...shopping, id: LIST_ONE, systemKey: null }],
      }),
      FamilyListStoreCorruptError
    );
    assert.throws(
      () => validateFamilyListStore({
        schemaVersion: 1,
        lists: [{ ...shopping, id: 'not-a-uuid' }],
      }),
      FamilyListStoreCorruptError
    );
    assert.throws(
      () => validateFamilyListStore({
        schemaVersion: 1,
        lists: [{ ...shopping, createdAt: 'not-a-date' }],
      }),
      FamilyListStoreCorruptError
    );
  });

  it('keeps a valid previous backup and supports manual recovery', async () => {
    const { filePath, store } = await makeStore();
    await store.read(NOW);
    const initial = await readFile(filePath, 'utf8');
    await store.createList({ id: LIST_ONE, name: 'School' }, LATER);
    assert.equal(await readFile(store.backupPath, 'utf8'), initial);
    await copyFile(store.backupPath, filePath);
    const recovered = await new FamilyListFileStore(filePath).read();
    assert.equal(recovered.lists.length, 1);
    assert.equal(recovered.lists[0].systemKey, 'shopping');
  });

  it('refuses a malformed primary without changing primary or backup', async () => {
    const { filePath, store } = await makeStore();
    await store.read(NOW);
    await store.createList({ id: LIST_ONE, name: 'School' }, LATER);
    const backup = await readFile(store.backupPath, 'utf8');
    const malformed = '{ private malformed bytes';
    await writeFile(filePath, malformed);
    await assert.rejects(store.read(), FamilyListStoreCorruptError);
    assert.equal(await readFile(filePath, 'utf8'), malformed);
    assert.equal(await readFile(store.backupPath, 'utf8'), backup);
  });
});

describe('Family list mutations', () => {
  it('makes list creation idempotent and conflicting ID/name reuse explicit', async () => {
    const { store } = await makeStore();
    const first = await store.createList({ id: LIST_ONE, name: '  School  ' }, NOW);
    const retry = await store.createList({ id: LIST_ONE, name: 'School' }, LATER);
    assert.equal(first.created, true);
    assert.equal(retry.created, false);
    await assert.rejects(
      store.createList({ id: LIST_ONE, name: 'Packing' }),
      FamilyListConflictError
    );
    await assert.rejects(
      store.createList({ id: LIST_TWO, name: 'sChOoL' }),
      FamilyListConflictError
    );
  });

  it('renames and archives/reactivates without changing Shopping identity or items', async () => {
    const { store } = await makeStore();
    await store.read(NOW);
    await store.createItem(
      SHOPPING_LIST_ID,
      itemInput(ITEM_ONE, 'Milk × 2'),
      NOW
    );
    await store.renameList(SHOPPING_LIST_ID, 'Groceries', LATER);
    await store.setListActive(SHOPPING_LIST_ID, false, LATER);
    let shopping = (await store.read()).lists[0];
    assert.equal(shopping.id, SHOPPING_LIST_ID);
    assert.equal(shopping.systemKey, 'shopping');
    assert.equal(shopping.name, 'Groceries');
    assert.equal(shopping.items.length, 1);
    await store.setListActive(SHOPPING_LIST_ID, true, LATER);
    shopping = (await store.read()).lists[0];
    assert.equal(shopping.active, true);
    assert.equal(shopping.systemKey, 'shopping');
  });

  it('persists list order and rejects stale orders after concurrent additions', async () => {
    const { store } = await makeStore();
    await store.createList({ id: LIST_ONE, name: 'School' }, NOW);
    const staleIds = (await store.read()).lists.map(list => list.id);
    await store.createList({ id: LIST_TWO, name: 'Packing' }, NOW);
    await assert.rejects(store.reorderLists(staleIds), FamilyListConflictError);
    await store.reorderLists([LIST_TWO, SHOPPING_LIST_ID, LIST_ONE]);
    assert.deepEqual(
      (await store.read()).lists.map(list => list.id),
      [LIST_TWO, SHOPPING_LIST_ID, LIST_ONE]
    );
  });
});

describe('Family list item mutations', () => {
  it('allows duplicate titles and preserves descriptive current or removed profile IDs', async () => {
    const { store } = await makeStore();
    await store.createItem(
      SHOPPING_LIST_ID,
      itemInput(ITEM_ONE, 'Milk', 'child-removed'),
      NOW
    );
    await store.createItem(
      SHOPPING_LIST_ID,
      itemInput(ITEM_TWO, 'Milk', 'adult-1'),
      NOW
    );
    const items = (await store.read()).lists[0].items;
    assert.deepEqual(items.map(item => item.title), ['Milk', 'Milk']);
    assert.deepEqual(
      items.map(item => item.addedByProfileId),
      ['child-removed', 'adult-1']
    );
  });

  it('makes item creation idempotent and conflicting global ID reuse explicit', async () => {
    const { store } = await makeStore();
    await store.createList({ id: LIST_ONE, name: 'School' }, NOW);
    const first = await store.createItem(
      SHOPPING_LIST_ID,
      itemInput(ITEM_ONE, 'Milk'),
      NOW
    );
    const retry = await store.createItem(
      SHOPPING_LIST_ID,
      itemInput(ITEM_ONE, 'Milk'),
      LATER
    );
    assert.equal(first.created, true);
    assert.equal(retry.created, false);
    await assert.rejects(
      store.createItem(SHOPPING_LIST_ID, itemInput(ITEM_ONE, 'Bread')),
      FamilyListConflictError
    );
    await assert.rejects(
      store.createItem(LIST_ONE, itemInput(ITEM_ONE, 'Milk')),
      FamilyListConflictError
    );
  });

  it('edits and reorders items and rejects stale item orders', async () => {
    const { store } = await makeStore();
    await store.createItem(SHOPPING_LIST_ID, itemInput(ITEM_ONE, 'Milk'), NOW);
    await store.createItem(SHOPPING_LIST_ID, itemInput(ITEM_TWO, 'Bread'), NOW);
    const staleIds = (await store.read()).lists[0].items.map(item => item.id);
    await store.createItem(SHOPPING_LIST_ID, itemInput(ITEM_THREE, 'Bananas'), NOW);
    await assert.rejects(
      store.reorderItems(SHOPPING_LIST_ID, staleIds),
      FamilyListConflictError
    );
    await store.editItem(SHOPPING_LIST_ID, ITEM_ONE, 'Milk × 2', LATER);
    await store.reorderItems(SHOPPING_LIST_ID, [ITEM_THREE, ITEM_ONE, ITEM_TWO]);
    const items = (await store.read()).lists[0].items;
    assert.equal(items[1].title, 'Milk × 2');
    assert.deepEqual(items.map(item => item.id), [ITEM_THREE, ITEM_ONE, ITEM_TWO]);
  });

  it('uses desired checked state and makes repeated state requests byte-for-byte no-ops', async () => {
    const { filePath, store } = await makeStore();
    await store.createItem(SHOPPING_LIST_ID, itemInput(ITEM_ONE, 'Milk'), NOW);
    await store.setItemChecked(SHOPPING_LIST_ID, ITEM_ONE, true, LATER);
    const checkedRaw = await readFile(filePath, 'utf8');
    await store.setItemChecked(
      SHOPPING_LIST_ID,
      ITEM_ONE,
      true,
      new Date('2026-08-29T11:00:00.000Z')
    );
    assert.equal(await readFile(filePath, 'utf8'), checkedRaw);
    await store.setItemChecked(SHOPPING_LIST_ID, ITEM_ONE, false, LATER);
    assert.equal((await store.read()).lists[0].items[0].checkedAt, null);
  });

  it('makes remove and Clear checked retries safe while preserving unchecked items', async () => {
    const { filePath, store } = await makeStore();
    await store.createItem(SHOPPING_LIST_ID, itemInput(ITEM_ONE, 'Milk'), NOW);
    await store.createItem(SHOPPING_LIST_ID, itemInput(ITEM_TWO, 'Bread'), NOW);
    await store.setItemChecked(SHOPPING_LIST_ID, ITEM_ONE, true, LATER);
    assert.equal((await store.clearChecked(SHOPPING_LIST_ID, LATER)).removedCount, 1);
    const clearedRaw = await readFile(filePath, 'utf8');
    assert.equal((await store.clearChecked(SHOPPING_LIST_ID, LATER)).removedCount, 0);
    assert.equal(await readFile(filePath, 'utf8'), clearedRaw);
    assert.deepEqual(
      (await store.read()).lists[0].items.map(item => item.title),
      ['Bread']
    );
    assert.equal((await store.removeItem(SHOPPING_LIST_ID, ITEM_TWO, LATER)).removed, true);
    const removedRaw = await readFile(filePath, 'utf8');
    assert.equal((await store.removeItem(SHOPPING_LIST_ID, ITEM_TWO, LATER)).removed, false);
    assert.equal(await readFile(filePath, 'utf8'), removedRaw);
  });

  it('serializes concurrent mutations without losing updates', async () => {
    const { filePath, store } = await makeStore();
    await Promise.all([
      store.createItem(SHOPPING_LIST_ID, itemInput(ITEM_ONE, 'Milk'), NOW),
      store.createItem(SHOPPING_LIST_ID, itemInput(ITEM_TWO, 'Bread'), NOW),
      store.createList({ id: LIST_THREE, name: 'DIY' }, NOW),
    ]);
    const persisted = await new FamilyListFileStore(filePath).read();
    assert.equal(persisted.lists.length, 2);
    assert.equal(
      persisted.lists.find(list => list.systemKey === 'shopping')?.items.length,
      2
    );
  });
});
