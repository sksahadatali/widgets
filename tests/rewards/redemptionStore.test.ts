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
import {
  afterEach,
  describe,
  it,
} from 'node:test';

import {
  RedemptionConflictError,
  RedemptionFileStore,
  RedemptionStoreCorruptError,
  RedemptionStoreError,
  validateRedemptionStore,
} from '../../server/src/services/redemptionStore.ts';

const ITEM_ONE =
  '11111111-1111-4111-8111-111111111111';
const ITEM_TWO =
  '22222222-2222-4222-8222-222222222222';
const REQUEST_ONE =
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REQUEST_TWO =
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW = new Date('2026-08-28T12:00:00.000Z');
const LATER = new Date('2026-08-28T13:00:00.000Z');
const temporaryDirectories: string[] = [];

async function makeStore() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'ey-redemptions-')
  );
  temporaryDirectories.push(directory);
  const filePath = path.join(
    directory,
    'redemptions.local.json'
  );
  return {
    directory,
    filePath,
    store: new RedemptionFileStore(filePath),
  };
}

const itemInput = (
  overrides: Record<string, unknown> = {}
) => ({
  id: ITEM_ONE,
  name: 'Choose family film',
  description: 'Choose the next family film',
  starCost: 40,
  ...overrides,
});

const requestInput = (
  overrides: Record<string, unknown> = {}
) => ({
  id: REQUEST_ONE,
  catalogueItemId: ITEM_ONE,
  profileId: 'child-1',
  requestedByProfileId: 'child-1',
  timeZone: 'Europe/London',
  ...overrides,
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(
      directory => rm(directory, {
        recursive: true,
        force: true,
      })
    )
  );
});

describe('RedemptionFileStore persistence', () => {
  it('creates and reloads an empty schema-v1 store', async () => {
    const { filePath, store } = await makeStore();
    assert.deepEqual(await store.read(), {
      schemaVersion: 1,
      catalogue: [],
      requests: [],
    });
    assert.deepEqual(
      await new RedemptionFileStore(filePath).read(),
      await store.read()
    );
  });

  it('writes atomically, retains the previous valid backup and supports recovery', async () => {
    const { filePath, store } = await makeStore();
    await store.createCatalogueItem(itemInput(), NOW);
    const previous = await readFile(filePath, 'utf8');
    await store.setCatalogueItemActive(
      ITEM_ONE,
      false,
      LATER
    );
    assert.equal(
      await readFile(store.backupPath, 'utf8'),
      previous
    );
    await copyFile(store.backupPath, filePath);
    const restored =
      await new RedemptionFileStore(filePath).read();
    assert.equal(restored.catalogue[0].active, true);
  });

  it('refuses malformed/unsupported stores without overwriting the primary or backup', async () => {
    const { filePath, store } = await makeStore();
    await store.createCatalogueItem(itemInput(), NOW);
    await store.setCatalogueItemActive(ITEM_ONE, false, LATER);
    const backup = await readFile(store.backupPath, 'utf8');
    const malformed = '{ not-json';
    await writeFile(filePath, malformed);
    await assert.rejects(
      store.read(),
      RedemptionStoreCorruptError
    );
    assert.equal(await readFile(filePath, 'utf8'), malformed);
    assert.equal(await readFile(store.backupPath, 'utf8'), backup);

    await writeFile(filePath, JSON.stringify({
      schemaVersion: 2,
      catalogue: [],
      requests: [],
    }));
    await assert.rejects(
      store.read(),
      RedemptionStoreCorruptError
    );
  });
});

describe('Redemption catalogue', () => {
  it('accepts 1–500 stars, normalizes text and rejects invalid boundaries', async () => {
    const { store } = await makeStore();
    const one = await store.createCatalogueItem(
      itemInput({
        name: '  Small reward  ',
        description: '   ',
        starCost: 1,
      }),
      NOW
    );
    assert.equal(one.item.name, 'Small reward');
    assert.equal(one.item.description, null);
    assert.equal(one.item.starCost, 1);
    await store.createCatalogueItem(
      itemInput({ id: ITEM_TWO, starCost: 500 }),
      NOW
    );

    for (const starCost of [0, 501, 1.5]) {
      await assert.rejects(
        store.createCatalogueItem(
          itemInput({
            id: crypto.randomUUID(),
            starCost,
          })
        ),
        RedemptionStoreError
      );
    }
    await assert.rejects(
      store.createCatalogueItem(itemInput({
        id: crypto.randomUUID(),
        name: ' ',
      })),
      RedemptionStoreError
    );
    await assert.rejects(
      store.createCatalogueItem(itemInput({
        id: crypto.randomUUID(),
        description: 'x'.repeat(241),
      })),
      RedemptionStoreError
    );
  });

  it('makes equivalent create/edit/active/reorder retries no-ops and conflicts explicit', async () => {
    const { filePath, store } = await makeStore();
    const first = await store.createCatalogueItem(
      itemInput(),
      NOW
    );
    const retry = await store.createCatalogueItem(
      itemInput(),
      LATER
    );
    assert.equal(first.item.id, retry.item.id);
    assert.equal(retry.created, false);
    await assert.rejects(
      store.createCatalogueItem(itemInput({
        name: 'Different item',
      })),
      RedemptionConflictError
    );

    await store.updateCatalogueItem(ITEM_ONE, {
      name: 'Edited reward',
      description: null,
      starCost: 50,
    }, LATER);
    const edited = await store.read();
    const updatedAt = edited.catalogue[0].updatedAt;
    await store.updateCatalogueItem(ITEM_ONE, {
      name: 'Edited reward',
      description: null,
      starCost: 50,
    }, new Date('2026-08-28T14:00:00.000Z'));
    assert.equal(
      (await store.read()).catalogue[0].updatedAt,
      updatedAt
    );

    await store.createCatalogueItem(
      itemInput({ id: ITEM_TWO }),
      NOW
    );
    await store.reorderCatalogue([ITEM_TWO, ITEM_ONE]);
    const orderedRaw = await readFile(filePath, 'utf8');
    await store.reorderCatalogue([ITEM_TWO, ITEM_ONE]);
    assert.equal(await readFile(filePath, 'utf8'), orderedRaw);
    await assert.rejects(
      store.reorderCatalogue([ITEM_ONE, ITEM_ONE]),
      RedemptionStoreError
    );

    await store.setCatalogueItemActive(ITEM_ONE, false, LATER);
    const inactiveRaw = await readFile(filePath, 'utf8');
    await store.setCatalogueItemActive(ITEM_ONE, false, LATER);
    assert.equal(await readFile(filePath, 'utf8'), inactiveRaw);
  });
});

describe('Redemption request contracts and closures', () => {
  it('captures an immutable contract across edit, deactivate and reorder', async () => {
    const { store } = await makeStore();
    await store.createCatalogueItem(itemInput(), NOW);
    await store.createCatalogueItem(
      itemInput({ id: ITEM_TWO, name: 'Second reward' }),
      NOW
    );
    await store.createRequest(requestInput(), NOW);
    const captured = structuredClone(
      (await store.read()).requests[0].contract
    );
    await store.updateCatalogueItem(ITEM_ONE, {
      name: 'Changed later',
      description: 'New description',
      starCost: 500,
    }, LATER);
    await store.setCatalogueItemActive(ITEM_ONE, false, LATER);
    await store.reorderCatalogue([ITEM_TWO, ITEM_ONE]);
    assert.deepEqual(
      (await store.read()).requests[0].contract,
      captured
    );
    await assert.rejects(
      store.createRequest(requestInput({ id: REQUEST_TWO })),
      RedemptionConflictError
    );
  });

  it('makes equivalent request retries idempotent and conflicting reuse explicit', async () => {
    const { store } = await makeStore();
    await store.createCatalogueItem(itemInput(), NOW);
    const first = await store.createRequest(
      requestInput(),
      NOW
    );
    const retry = await store.createRequest(
      requestInput(),
      LATER
    );
    assert.equal(retry.created, false);
    assert.equal(retry.request.id, first.request.id);
    await assert.rejects(
      store.createRequest(requestInput({
        profileId: 'child-2',
        requestedByProfileId: 'child-2',
      })),
      RedemptionConflictError
    );
    await assert.rejects(
      store.createRequest(requestInput({
        id: REQUEST_TWO,
        profileId: 'family',
        requestedByProfileId: 'family',
      })),
      RedemptionStoreError
    );
    await assert.rejects(
      store.createRequest(requestInput({
        id: REQUEST_TWO,
        requestedByProfileId: 'child-2',
      })),
      RedemptionStoreError
    );
  });

  it('allows one idempotent cancellation or decline and rejects conflicting transitions', async () => {
    const { store } = await makeStore();
    await store.createCatalogueItem(itemInput(), NOW);
    await store.createRequest(requestInput(), NOW);
    const cancelled = await store.cancelRequest(
      REQUEST_ONE,
      'child-1',
      LATER
    );
    const retry = await store.cancelRequest(
      REQUEST_ONE,
      'child-1',
      LATER
    );
    assert.equal(cancelled.created, true);
    assert.equal(retry.created, false);
    assert.equal(retry.request.closure?.kind, 'cancelled');
    await assert.rejects(
      store.declineRequest(
        REQUEST_ONE,
        'adult-1',
        LATER
      ),
      RedemptionConflictError
    );

    await store.createRequest(
      requestInput({ id: REQUEST_TWO }),
      NOW
    );
    const declined = await store.declineRequest(
      REQUEST_TWO,
      'adult-1',
      LATER
    );
    assert.equal(declined.request.closure?.kind, 'declined');
    await assert.rejects(
      store.cancelRequest(
        REQUEST_TWO,
        'child-1',
        LATER
      ),
      RedemptionConflictError
    );
  });

  it('serializes concurrent duplicate and competing transitions', async () => {
    const { store } = await makeStore();
    await store.createCatalogueItem(itemInput(), NOW);
    const [first, second] = await Promise.all([
      store.createRequest(requestInput(), NOW),
      store.createRequest(requestInput(), NOW),
    ]);
    assert.equal(
      Number(first.created) + Number(second.created),
      1
    );
    const results = await Promise.allSettled([
      store.cancelRequest(REQUEST_ONE, 'child-1', LATER),
      store.declineRequest(REQUEST_ONE, 'adult-1', LATER),
    ]);
    assert.equal(
      results.filter(result => result.status === 'fulfilled').length,
      1
    );
    assert.equal(
      (await store.read()).requests.filter(
        request => request.closure !== null
      ).length,
      1
    );
  });

  it('leaves an adjacent Rewards ledger byte-for-byte unchanged', async () => {
    const { directory, store } = await makeStore();
    const rewardPath = path.join(
      directory,
      'rewards.local.json'
    );
    const rewardLedger = JSON.stringify({
      schemaVersion: 1,
      transactions: [{ id: 'existing-ledger-record' }],
    }, null, 2);
    await writeFile(rewardPath, rewardLedger);
    await store.createCatalogueItem(itemInput(), NOW);
    await store.updateCatalogueItem(ITEM_ONE, {
      name: 'Updated',
      description: null,
      starCost: 500,
    }, LATER);
    await store.setCatalogueItemActive(ITEM_ONE, false, LATER);
    await store.setCatalogueItemActive(ITEM_ONE, true, LATER);
    await store.createRequest(requestInput(), NOW);
    await store.cancelRequest(REQUEST_ONE, 'child-1', LATER);
    assert.equal(await readFile(rewardPath, 'utf8'), rewardLedger);
  });
});

describe('Redemption schema validation', () => {
  it('rejects request contracts referencing an unknown catalogue ID', () => {
    assert.throws(() => validateRedemptionStore({
      schemaVersion: 1,
      catalogue: [],
      requests: [{
        id: REQUEST_ONE,
        eventKey: `redemption-request:${REQUEST_ONE}`,
        profileId: 'child-1',
        requestedByProfileId: 'child-1',
        contract: {
          catalogueItemId: ITEM_ONE,
          name: 'Captured reward',
          description: null,
          currency: 'star',
          starCost: 10,
        },
        requestedAt: NOW.toISOString(),
        localDate: '2026-08-28',
        timeZone: 'Europe/London',
        closure: null,
      }],
    }), RedemptionStoreCorruptError);
  });
});
