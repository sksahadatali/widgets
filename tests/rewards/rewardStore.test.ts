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
  RewardFileStore,
  RewardIdempotencyConflictError,
  RewardNotFoundError,
  RewardStoreCorruptError,
  RewardStoreError,
  validateRewardStore,
} from '../../server/src/services/rewardStore.ts';
import type {
  RewardAwardInput,
  RewardStoreData,
  RewardTransaction,
} from '../../server/src/types/reward.ts';

const temporaryDirectories: string[] = [];
const NOW = new Date(
  '2026-08-28T12:00:00.000Z'
);

async function makeStore() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'ey-rewards-')
  );
  temporaryDirectories.push(directory);
  const filePath = path.join(
    directory,
    'rewards.local.json'
  );

  return {
    directory,
    filePath,
    store: new RewardFileStore(filePath),
  };
}

function awardInput(
  overrides: Partial<RewardAwardInput> = {}
): RewardAwardInput {
  return {
    profileId: 'child-1',
    amount: 10,
    category: 'helping',
    reason: 'Helpful contribution',
    source: {
      kind: 'manual-parent-award',
      eventKey: 'manual-award:request-1',
    },
    actorProfileId: 'adult-1',
    timeZone: 'Europe/London',
    ...overrides,
  };
}

function transaction(
  overrides: Partial<RewardTransaction> = {}
): RewardTransaction {
  return {
    id: 'transaction-1',
    profileId: 'child-1',
    entryType: 'award',
    currency: 'star',
    amount: 10,
    category: 'helping',
    reason: 'Safe test reason',
    source: {
      kind: 'manual-parent-award',
      eventKey: 'manual-award:test-1',
    },
    relation: null,
    actorProfileId: 'adult-1',
    createdAt: NOW.toISOString(),
    localDate: '2026-08-28',
    timeZone: 'Europe/London',
    ...overrides,
  };
}

function storeData(
  transactions: RewardTransaction[]
): RewardStoreData {
  return {
    schemaVersion: 1,
    transactions,
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

describe('RewardFileStore persistence', () => {
  it('creates and reloads a valid empty store', async () => {
    const { filePath, store } = await makeStore();

    assert.deepEqual(await store.read(), {
      schemaVersion: 1,
      transactions: [],
    });
    assert.deepEqual(
      await new RewardFileStore(filePath).read(),
      {
        schemaVersion: 1,
        transactions: [],
      }
    );
  });

  it('persists transactions across a store restart', async () => {
    const { filePath, store } = await makeStore();

    await store.appendAward(
      'transaction-1',
      awardInput(),
      NOW
    );
    const reloaded =
      await new RewardFileStore(filePath).read();

    assert.equal(reloaded.transactions.length, 1);
    assert.equal(
      reloaded.transactions[0].amount,
      10
    );
  });

  it('refuses malformed JSON and leaves it untouched', async () => {
    const { filePath, store } = await makeStore();
    const malformed = '{"schemaVersion":1';

    await writeFile(filePath, malformed, 'utf8');
    await assert.rejects(
      () => store.read(),
      RewardStoreCorruptError
    );
    assert.equal(
      await readFile(filePath, 'utf8'),
      malformed
    );
  });

  it('refuses unsupported schema versions without rewriting', async () => {
    const { filePath, store } = await makeStore();
    const unsupported = JSON.stringify({
      schemaVersion: 2,
      transactions: [],
    });

    await writeFile(filePath, unsupported, 'utf8');
    await assert.rejects(
      () => store.read(),
      RewardStoreCorruptError
    );
    assert.equal(
      await readFile(filePath, 'utf8'),
      unsupported
    );
  });

  it('writes atomically and retains the previous valid primary as .bak', async () => {
    const { directory, filePath, store } =
      await makeStore();
    await store.read();
    const emptyPrimary = await readFile(
      filePath,
      'utf8'
    );

    await store.appendAward(
      'transaction-1',
      awardInput(),
      NOW
    );

    assert.equal(
      await readFile(store.backupPath, 'utf8'),
      emptyPrimary
    );
    assert.deepEqual(
      (await readdir(directory)).sort(),
      [
        'rewards.local.json',
        'rewards.local.json.bak',
      ]
    );
  });

  it('does not replace a valid backup when the primary becomes malformed', async () => {
    const { filePath, store } = await makeStore();
    await store.read();
    await store.appendAward(
      'transaction-1',
      awardInput(),
      NOW
    );
    const backup = await readFile(
      store.backupPath,
      'utf8'
    );

    await writeFile(filePath, '{bad', 'utf8');
    await assert.rejects(
      () => store.appendAward(
        'transaction-2',
        awardInput({
          source: {
            kind: 'manual-parent-award',
            eventKey: 'manual-award:request-2',
          },
        }),
        NOW
      ),
      RewardStoreCorruptError
    );
    assert.equal(
      await readFile(store.backupPath, 'utf8'),
      backup
    );
    assert.equal(
      await readFile(filePath, 'utf8'),
      '{bad'
    );
  });

  it('recovers by restoring the previous valid backup', async () => {
    const { filePath, store } = await makeStore();
    await store.read();
    await store.appendAward(
      'transaction-1',
      awardInput(),
      NOW
    );
    await writeFile(filePath, '{bad', 'utf8');

    await copyFile(store.backupPath, filePath);
    const recovered =
      await new RewardFileStore(filePath).read();

    assert.deepEqual(recovered, {
      schemaVersion: 1,
      transactions: [],
    });
  });
});

describe('Reward ledger validation', () => {
  it('rejects duplicate transaction IDs', () => {
    assert.throws(
      () => validateRewardStore(
        storeData([
          transaction(),
          transaction({
            source: {
              kind: 'manual-parent-award',
              eventKey: 'manual-award:test-2',
            },
          }),
        ])
      ),
      RewardStoreCorruptError
    );
  });

  it('rejects duplicate event keys', () => {
    assert.throws(
      () => validateRewardStore(
        storeData([
          transaction(),
          transaction({ id: 'transaction-2' }),
        ])
      ),
      RewardStoreCorruptError
    );
  });

  it('rejects zero, fractional, unsafe and negative award amounts', async () => {
    const { store } = await makeStore();

    for (const amount of [
      0,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      -1,
    ]) {
      await assert.rejects(
        () => store.appendAward(
          `transaction-${String(amount)}`,
          awardInput({ amount }),
          NOW
        ),
        RewardStoreError
      );
    }
  });

  it('does not impose a ledger maximum of 100', async () => {
    const { store } = await makeStore();
    const result = await store.appendAward(
      'transaction-1',
      awardInput({ amount: 1000 }),
      NOW
    );

    assert.equal(result.transaction.amount, 1000);
  });

  it('rejects profile and aggregate safe-integer overflow', async () => {
    const { filePath, store } = await makeStore();
    await writeFile(
      filePath,
      `${JSON.stringify(
        storeData([
          transaction({
            amount: Number.MAX_SAFE_INTEGER,
          }),
        ]),
        null,
        2
      )}\n`,
      'utf8'
    );

    await assert.rejects(
      () => store.appendAward(
        'transaction-2',
        awardInput({
          amount: 1,
          source: {
            kind: 'manual-parent-award',
            eventKey: 'manual-award:test-2',
          },
        }),
        NOW
      ),
      RewardStoreError
    );
    assert.equal(
      (await store.read()).transactions.length,
      1
    );
  });

  it('rejects Family as a recipient but accepts generic non-Family IDs', async () => {
    const { store } = await makeStore();

    await assert.rejects(
      () => store.appendAward(
        'transaction-1',
        awardInput({ profileId: 'family' }),
        NOW
      ),
      RewardStoreError
    );
    const accepted = await store.appendAward(
      'transaction-2',
      awardInput({ profileId: 'adult-1' }),
      NOW
    );
    assert.equal(
      accepted.transaction.profileId,
      'adult-1'
    );
  });
});

describe('Manual Parent Award operation policy', () => {
  it('accepts the 1 and 100 boundaries and trims the reason', async () => {
    const { store } = await makeStore();
    const first = await store.appendManualAward(
      'manual-1',
      awardInput({
        amount: 1,
        reason: '  Good effort  ',
      }),
      NOW
    );
    const second = await store.appendManualAward(
      'manual-2',
      awardInput({
        amount: 100,
        source: {
          kind: 'manual-parent-award',
          eventKey: 'manual-award:request-2',
        },
      }),
      NOW
    );

    assert.equal(first.transaction.amount, 1);
    assert.equal(first.transaction.reason, 'Good effort');
    assert.equal(second.transaction.amount, 100);
  });

  it('rejects 0, 101 and fractional Manual Award amounts', async () => {
    const { store } = await makeStore();

    for (const amount of [0, 101, 1.5]) {
      await assert.rejects(
        () => store.appendManualAward(
          `manual-${String(amount)}`,
          awardInput({ amount }),
          NOW
        ),
        RewardStoreError
      );
    }
  });

  it('requires an allowed category, reason and adult actor context', async () => {
    const { store } = await makeStore();

    for (const input of [
      awardInput({ reason: null }),
      awardInput({ reason: '   ' }),
      awardInput({ reason: 'x'.repeat(161) }),
      awardInput({ category: 'routine' }),
      awardInput({ actorProfileId: null }),
      awardInput({ actorProfileId: 'family' }),
      awardInput({
        source: {
          kind: 'manual-parent-award',
          eventKey: 'wrong-prefix',
        },
      }),
    ]) {
      await assert.rejects(
        () => store.appendManualAward(
          crypto.randomUUID(),
          input,
          NOW
        ),
        RewardStoreError
      );
    }
  });

  it('retains event-key idempotency for Manual Award retries', async () => {
    const { store } = await makeStore();
    const first = await store.appendManualAward(
      'manual-1',
      awardInput(),
      NOW
    );
    const retry = await store.appendManualAward(
      'manual-2',
      awardInput(),
      new Date('2026-08-28T13:00:00.000Z')
    );

    assert.equal(first.created, true);
    assert.equal(retry.created, false);
    assert.equal(first.transaction.id, retry.transaction.id);
  });
});

describe('Reward idempotency', () => {
  it('returns the existing transaction for an equivalent retry', async () => {
    const { store } = await makeStore();
    const first = await store.appendAward(
      'transaction-1',
      awardInput(),
      NOW
    );
    const retry = await store.appendAward(
      'transaction-2',
      awardInput(),
      new Date('2026-08-28T13:00:00.000Z')
    );

    assert.equal(first.created, true);
    assert.equal(retry.created, false);
    assert.equal(
      retry.transaction.id,
      first.transaction.id
    );
    assert.equal(
      (await store.read()).transactions.length,
      1
    );
  });

  it('treats semantically equal source fields as equivalent regardless of property order', async () => {
    const { store } = await makeStore();
    const firstSource = {
      kind: 'routine-completion' as const,
      eventKey: 'routine-occurrence:routine-1@2026-08-28:completion:1',
      routineId: 'routine-1',
      occurrenceId: 'routine-1@2026-08-28',
      label: 'Example routine',
    };
    const reorderedSource = {
      label: 'Example routine',
      occurrenceId: 'routine-1@2026-08-28',
      routineId: 'routine-1',
      eventKey: 'routine-occurrence:routine-1@2026-08-28:completion:1',
      kind: 'routine-completion' as const,
    };

    const first = await store.appendAward(
      'transaction-1',
      awardInput({
        category: 'routine',
        source: firstSource,
      }),
      NOW
    );
    const retry = await store.appendAward(
      'transaction-2',
      awardInput({
        category: 'routine',
        source: reorderedSource,
      }),
      NOW
    );

    assert.equal(retry.created, false);
    assert.equal(
      retry.transaction.id,
      first.transaction.id
    );
  });

  it('rejects conflicting reuse of an event key', async () => {
    const { store } = await makeStore();
    await store.appendAward(
      'transaction-1',
      awardInput(),
      NOW
    );

    await assert.rejects(
      () => store.appendAward(
        'transaction-2',
        awardInput({ amount: 11 }),
        NOW
      ),
      RewardIdempotencyConflictError
    );
  });

  it('serializes concurrent duplicate event submissions', async () => {
    const { store } = await makeStore();
    const results = await Promise.all([
      store.appendAward(
        'transaction-1',
        awardInput(),
        NOW
      ),
      store.appendAward(
        'transaction-2',
        awardInput(),
        NOW
      ),
      store.appendAward(
        'transaction-3',
        awardInput(),
        NOW
      ),
    ]);

    assert.equal(
      results.filter(result => result.created).length,
      1
    );
    assert.equal(
      new Set(
        results.map(
          result => result.transaction.id
        )
      ).size,
      1
    );
    assert.equal(
      (await store.read()).transactions.length,
      1
    );
  });
});

describe('Reward reversals', () => {
  it('appends an exact linked opposite and keeps the original', async () => {
    const { store } = await makeStore();
    const award = await store.appendAward(
      'award-1',
      awardInput(),
      NOW
    );
    const reversal = await store.reverseTransaction(
      'reversal-1',
      award.transaction.id,
      {
        eventKey: 'reversal:request-1',
        reason: 'Correcting the award',
        actorProfileId: 'adult-1',
        timeZone: 'Europe/London',
      },
      new Date('2026-08-28T13:00:00.000Z')
    );
    const persisted = await store.read();

    assert.equal(reversal.transaction.amount, -10);
    assert.equal(
      reversal.transaction.profileId,
      award.transaction.profileId
    );
    assert.equal(
      reversal.transaction.relation?.kind,
      'reversal-of'
    );
    assert.equal(
      reversal.transaction.relation?.transactionId,
      award.transaction.id
    );
    assert.deepEqual(
      persisted.transactions.map(item => item.id),
      ['award-1', 'reversal-1']
    );
  });

  it('rejects unknown and self reversal targets', async () => {
    const { store } = await makeStore();
    const input = {
      eventKey: 'reversal:request-1',
      reason: 'Correction',
      actorProfileId: 'adult-1',
      timeZone: 'Europe/London',
    };

    await assert.rejects(
      () => store.reverseTransaction(
        'reversal-1',
        'unknown',
        input,
        NOW
      ),
      RewardNotFoundError
    );
    await store.appendAward(
      'award-1',
      awardInput(),
      NOW
    );
    await assert.rejects(
      () => store.reverseTransaction(
        'award-1',
        'award-1',
        input,
        NOW
      ),
      RewardStoreError
    );
  });

  it('rejects reversal-of-reversal and a second reversal', async () => {
    const { store } = await makeStore();
    await store.appendAward(
      'award-1',
      awardInput(),
      NOW
    );
    await store.reverseTransaction(
      'reversal-1',
      'award-1',
      {
        eventKey: 'reversal:request-1',
        reason: 'Correction',
        actorProfileId: null,
        timeZone: 'Europe/London',
      },
      NOW
    );

    await assert.rejects(
      () => store.reverseTransaction(
        'reversal-2',
        'reversal-1',
        {
          eventKey: 'reversal:request-2',
          reason: 'Invalid correction',
          actorProfileId: null,
          timeZone: 'Europe/London',
        },
        NOW
      ),
      RewardStoreError
    );
    await assert.rejects(
      () => store.reverseTransaction(
        'reversal-3',
        'award-1',
        {
          eventKey: 'reversal:request-3',
          reason: 'Duplicate correction',
          actorProfileId: null,
          timeZone: 'Europe/London',
        },
        NOW
      ),
      RewardStoreError
    );
  });

  it('makes equivalent reversal retries idempotent and conflicts explicit', async () => {
    const { store } = await makeStore();
    await store.appendAward(
      'award-1',
      awardInput(),
      NOW
    );
    const input = {
      eventKey: 'reversal:request-1',
      reason: 'Correction',
      actorProfileId: null,
      timeZone: 'Europe/London',
    };
    const first = await store.reverseTransaction(
      'reversal-1',
      'award-1',
      input,
      NOW
    );
    const retry = await store.reverseTransaction(
      'reversal-2',
      'award-1',
      input,
      new Date('2026-08-28T14:00:00.000Z')
    );

    assert.equal(first.created, true);
    assert.equal(retry.created, false);
    assert.equal(
      first.transaction.id,
      retry.transaction.id
    );
    await assert.rejects(
      () => store.reverseTransaction(
        'reversal-3',
        'award-1',
        { ...input, reason: 'Different correction' },
        NOW
      ),
      RewardIdempotencyConflictError
    );
  });
});
