import assert from 'node:assert/strict';
import {
  copyFile,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach,
  describe,
  it,
} from 'node:test';

import {
  MealPlanConflictError,
  MealPlanFileStore,
  MealPlanStoreCorruptError,
  MealPlanStoreError,
  validateMealPlanStore,
} from '../../server/src/services/mealPlanStore.ts';

const ENTRY_ONE = '11111111-1111-4111-8111-111111111111';
const ENTRY_TWO = '22222222-2222-4222-8222-222222222222';
const ENTRY_THREE = '33333333-3333-4333-8333-333333333333';
const ENTRY_FOUR = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-08-31T09:00:00.000Z');
const LATER = new Date('2026-08-31T10:00:00.000Z');
const temporaryDirectories: string[] = [];

async function makeStore() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'ey-meals-')
  );
  temporaryDirectories.push(directory);
  const filePath = path.join(
    directory,
    'meals.local.json'
  );

  return {
    directory,
    filePath,
    store: new MealPlanFileStore(filePath),
  };
}

function input(
  id: string,
  localDate: string,
  mealType: 'breakfast' | 'lunch' | 'dinner',
  title: string
) {
  return { id, localDate, mealType, title };
}

function persistedEntry(
  overrides: Record<string, unknown> = {}
) {
  return {
    id: ENTRY_ONE,
    localDate: '2026-08-31',
    mealType: 'breakfast',
    title: 'Porridge',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(
      directory => rm(
        directory,
        { recursive: true, force: true }
      )
    )
  );
});

describe('MealPlanFileStore validation and persistence', () => {
  it('initializes and reconstructs an empty schema-v1 store', async () => {
    const { filePath, store } = await makeStore();
    assert.deepEqual(await store.read(), {
      schemaVersion: 1,
      entries: [],
    });
    assert.deepEqual(
      await new MealPlanFileStore(filePath).read(),
      { schemaVersion: 1, entries: [] }
    );
  });

  it('strictly validates schema, IDs, dates, meal type, title and timestamps', () => {
    const valid = {
      schemaVersion: 1,
      entries: [persistedEntry()],
    };
    assert.doesNotThrow(
      () => validateMealPlanStore(valid)
    );
    assert.doesNotThrow(() => validateMealPlanStore({
      schemaVersion: 1,
      entries: [persistedEntry({
        localDate: '2024-02-29',
      })],
    }));

    const invalidValues = [
      { ...valid, schemaVersion: 2 },
      { ...valid, extra: true },
      { schemaVersion: 1, entries: [persistedEntry({ extra: true })] },
      { schemaVersion: 1, entries: [persistedEntry({ id: 'not-a-uuid' })] },
      { schemaVersion: 1, entries: [persistedEntry({ id: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' })] },
      { schemaVersion: 1, entries: [persistedEntry({ localDate: '2026-02-30' })] },
      { schemaVersion: 1, entries: [persistedEntry({ mealType: 'snack' })] },
      { schemaVersion: 1, entries: [persistedEntry({ title: ' Porridge ' })] },
      { schemaVersion: 1, entries: [persistedEntry({ title: '' })] },
      { schemaVersion: 1, entries: [persistedEntry({ title: 'x'.repeat(161) })] },
      { schemaVersion: 1, entries: [persistedEntry({ createdAt: 'not-a-date' })] },
      { schemaVersion: 1, entries: [persistedEntry({ updatedAt: '2026-08-31T08:00:00.000Z' })] },
      { schemaVersion: 1, entries: [persistedEntry(), persistedEntry()] },
    ];

    invalidValues.forEach(value => {
      assert.throws(
        () => validateMealPlanStore(value),
        MealPlanStoreCorruptError
      );
    });
  });

  it('retains one valid backup, atomically replaces and leaves no temporary files', async () => {
    const { directory, filePath, store } = await makeStore();
    await store.read();
    const initial = await readFile(filePath, 'utf8');
    await store.createEntry(
      input(ENTRY_ONE, '2026-08-31', 'breakfast', 'Porridge'),
      NOW
    );
    assert.equal(
      await readFile(store.backupPath, 'utf8'),
      initial
    );
    assert.equal(
      (await readdir(directory)).some(name => name.endsWith('.tmp')),
      false
    );
    await copyFile(store.backupPath, filePath);
    assert.deepEqual(
      await new MealPlanFileStore(filePath).read(),
      { schemaVersion: 1, entries: [] }
    );
  });

  it('fails closed without changing a malformed primary or valid backup', async () => {
    const { filePath, store } = await makeStore();
    await store.read();
    await store.createEntry(
      input(ENTRY_ONE, '2026-08-31', 'breakfast', 'Porridge'),
      NOW
    );
    const backup = await readFile(store.backupPath, 'utf8');
    const malformed = '{ private malformed bytes';
    await writeFile(filePath, malformed);
    await assert.rejects(
      store.read(),
      MealPlanStoreCorruptError
    );
    assert.equal(await readFile(filePath, 'utf8'), malformed);
    assert.equal(
      await readFile(store.backupPath, 'utf8'),
      backup
    );
  });

  it('accepts any valid start and returns only its seven-date window', async () => {
    const { store } = await makeStore();
    await store.createEntry(
      input(ENTRY_ONE, '2026-08-31', 'breakfast', 'Porridge'),
      NOW
    );
    await store.createEntry(
      input(ENTRY_TWO, '2026-09-06', 'dinner', 'Pasta'),
      NOW
    );
    await store.createEntry(
      input(ENTRY_THREE, '2026-09-07', 'lunch', 'Soup'),
      NOW
    );
    assert.deepEqual(
      (await store.readWindow('2026-09-01')).map(entry => entry.id),
      [ENTRY_TWO, ENTRY_THREE]
    );
    await assert.rejects(
      store.readWindow('2026-02-30'),
      MealPlanStoreError
    );
  });
});

describe('MealPlanFileStore CRUD and ordering', () => {
  it('allows duplicate titles, appends within slots and makes create retry-safe', async () => {
    const { filePath, store } = await makeStore();
    const first = input(
      ENTRY_ONE,
      '2026-08-31',
      'breakfast',
      'Porridge'
    );
    assert.equal(
      (await store.createEntry(first, NOW)).created,
      true
    );
    await store.createEntry(
      input(ENTRY_TWO, '2026-09-01', 'lunch', 'Soup'),
      NOW
    );
    await store.createEntry(
      input(ENTRY_THREE, '2026-08-31', 'breakfast', 'Porridge'),
      NOW
    );
    const beforeRetry = await readFile(filePath, 'utf8');
    const retry = await store.createEntry(first, LATER);
    assert.equal(retry.created, false);
    assert.equal(await readFile(filePath, 'utf8'), beforeRetry);
    assert.deepEqual(
      (await store.read()).entries.map(entry => entry.id),
      [ENTRY_ONE, ENTRY_THREE, ENTRY_TWO]
    );
    await assert.rejects(
      store.createEntry({ ...first, title: 'Toast' }),
      MealPlanConflictError
    );
  });

  it('normalizes titles and rejects empty or overlong creation input', async () => {
    const { store } = await makeStore();
    const created = await store.createEntry(
      input(ENTRY_ONE, '2026-08-31', 'breakfast', '  Porridge  '),
      NOW
    );
    assert.equal(created.entry.title, 'Porridge');
    await assert.rejects(
      store.createEntry(
        input(ENTRY_TWO, '2026-08-31', 'breakfast', '   ')
      ),
      MealPlanStoreError
    );
    await assert.rejects(
      store.createEntry(
        input(ENTRY_THREE, '2026-08-31', 'breakfast', 'x'.repeat(161))
      ),
      MealPlanStoreError
    );
  });

  it('edits in place and makes equivalent edits byte-for-byte no-ops', async () => {
    const { filePath, store } = await makeStore();
    await store.createEntry(
      input(ENTRY_ONE, '2026-08-31', 'breakfast', 'Porridge'),
      NOW
    );
    await store.createEntry(
      input(ENTRY_TWO, '2026-08-31', 'breakfast', 'Toast'),
      NOW
    );
    const updated = await store.updateEntry(
      ENTRY_ONE,
      { title: 'Porridge and fruit' },
      LATER
    );
    assert.equal(updated.entry.createdAt, NOW.toISOString());
    assert.equal(updated.entry.updatedAt, LATER.toISOString());
    assert.deepEqual(
      (await store.read()).entries.map(entry => entry.id),
      [ENTRY_ONE, ENTRY_TWO]
    );
    const beforeNoOp = await readFile(filePath, 'utf8');
    const backupBeforeNoOp = await readFile(
      store.backupPath,
      'utf8'
    );
    await store.updateEntry(
      ENTRY_ONE,
      { title: ' Porridge and fruit ' },
      new Date('2026-08-31T11:00:00.000Z')
    );
    assert.equal(await readFile(filePath, 'utf8'), beforeNoOp);
    assert.equal(
      await readFile(store.backupPath, 'utf8'),
      backupBeforeNoOp
    );
  });

  it('removes safely without corrupting relative order', async () => {
    const { filePath, store } = await makeStore();
    await Promise.all([
      store.createEntry(input(ENTRY_ONE, '2026-08-31', 'lunch', 'Soup'), NOW),
      store.createEntry(input(ENTRY_TWO, '2026-08-31', 'lunch', 'Salad'), NOW),
      store.createEntry(input(ENTRY_THREE, '2026-08-31', 'lunch', 'Fruit'), NOW),
    ]);
    assert.equal((await store.removeEntry(ENTRY_TWO)).removed, true);
    assert.deepEqual(
      (await store.read()).entries.map(entry => entry.id),
      [ENTRY_ONE, ENTRY_THREE]
    );
    const beforeRetry = await readFile(filePath, 'utf8');
    assert.equal((await store.removeEntry(ENTRY_TWO)).removed, false);
    assert.equal(await readFile(filePath, 'utf8'), beforeRetry);
  });

  it('rejects partial moves and unknown update keys', async () => {
    const { store } = await makeStore();
    await store.createEntry(
      input(ENTRY_ONE, '2026-08-31', 'breakfast', 'Porridge'),
      NOW
    );
    await assert.rejects(
      store.updateEntry(ENTRY_ONE, { localDate: '2026-09-01' }),
      MealPlanStoreError
    );
    await assert.rejects(
      store.updateEntry(ENTRY_ONE, { mealType: 'dinner' }),
      MealPlanStoreError
    );
    await assert.rejects(
      store.updateEntry(ENTRY_ONE, { title: 'Toast', extra: true }),
      MealPlanStoreError
    );
  });
});

describe('MealPlanFileStore move, copy and concurrency', () => {
  it('moves across days/types while preserving identity and appending to the target', async () => {
    const { filePath, store } = await makeStore();
    await store.createEntry(
      input(ENTRY_ONE, '2026-09-01', 'dinner', 'Pasta'),
      NOW
    );
    await store.createEntry(
      input(ENTRY_TWO, '2026-08-31', 'breakfast', 'Porridge'),
      NOW
    );
    await store.createEntry(
      input(ENTRY_THREE, '2026-09-01', 'dinner', 'Salad'),
      NOW
    );
    const sameDayDifferentType = await store.updateEntry(
      ENTRY_TWO,
      {
        localDate: '2026-08-31',
        mealType: 'lunch',
      },
      new Date('2026-08-31T09:15:00.000Z')
    );
    assert.equal(sameDayDifferentType.entry.localDate, '2026-08-31');
    assert.equal(sameDayDifferentType.entry.mealType, 'lunch');

    const differentDaySameType = await store.updateEntry(
      ENTRY_TWO,
      {
        localDate: '2026-09-01',
        mealType: 'lunch',
      },
      new Date('2026-08-31T09:30:00.000Z')
    );
    assert.equal(differentDaySameType.entry.localDate, '2026-09-01');
    assert.equal(differentDaySameType.entry.mealType, 'lunch');

    const moved = await store.updateEntry(
      ENTRY_TWO,
      {
        localDate: '2026-09-01',
        mealType: 'dinner',
      },
      LATER
    );
    assert.deepEqual(moved.entry, {
      id: ENTRY_TWO,
      localDate: '2026-09-01',
      mealType: 'dinner',
      title: 'Porridge',
      createdAt: NOW.toISOString(),
      updatedAt: LATER.toISOString(),
    });
    assert.deepEqual(
      (await store.read()).entries.map(entry => entry.id),
      [ENTRY_ONE, ENTRY_THREE, ENTRY_TWO]
    );
    const beforeNoOp = await readFile(filePath, 'utf8');
    await store.updateEntry(
      ENTRY_TWO,
      {
        localDate: '2026-09-01',
        mealType: 'dinner',
      },
      new Date('2026-08-31T11:00:00.000Z')
    );
    assert.equal(await readFile(filePath, 'utf8'), beforeNoOp);
  });

  it('implements copy through a fresh retry-safe create that appends to the target', async () => {
    const { store } = await makeStore();
    await store.createEntry(
      input(ENTRY_ONE, '2026-08-31', 'breakfast', 'Porridge'),
      NOW
    );
    await store.createEntry(
      input(ENTRY_TWO, '2026-09-01', 'lunch', 'Soup'),
      NOW
    );
    const copy = input(
      ENTRY_THREE,
      '2026-09-01',
      'lunch',
      'Porridge'
    );
    const created = await store.createEntry(copy, LATER);
    const retry = await store.createEntry(
      copy,
      new Date('2026-08-31T11:00:00.000Z')
    );
    assert.equal(created.created, true);
    assert.equal(retry.created, false);
    assert.equal(created.entry.createdAt, LATER.toISOString());
    assert.deepEqual(
      (await store.read()).entries.map(entry => entry.id),
      [ENTRY_ONE, ENTRY_TWO, ENTRY_THREE]
    );
  });

  it('serializes queued mutations without losing unrelated entries', async () => {
    const { filePath, store } = await makeStore();
    await Promise.all([
      store.createEntry(input(ENTRY_ONE, '2026-08-31', 'breakfast', 'A'), NOW),
      store.createEntry(input(ENTRY_TWO, '2026-08-31', 'lunch', 'B'), NOW),
      store.createEntry(input(ENTRY_THREE, '2026-08-31', 'dinner', 'C'), NOW),
      store.createEntry(input(ENTRY_FOUR, '2026-09-01', 'dinner', 'D'), NOW),
    ]);
    const reconstructed =
      await new MealPlanFileStore(filePath).read();
    assert.equal(reconstructed.entries.length, 4);
    assert.deepEqual(
      new Set(reconstructed.entries.map(entry => entry.id)),
      new Set([ENTRY_ONE, ENTRY_TWO, ENTRY_THREE, ENTRY_FOUR])
    );
  });
});
