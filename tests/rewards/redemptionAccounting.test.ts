import assert from 'node:assert/strict';
import {
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
  approveDemoRedemptionRequest,
  cancelDemoRedemptionLifecycle,
  declineDemoRedemptionLifecycle,
  refundDemoRedemptionRequest,
} from '../../app/src/redemptions/demoRedemptionAccounting.ts';
import {
  createDemoRedemptionRequest,
  getDemoRedemptionStore,
  resetDemoRedemptionStore,
  updateDemoCatalogueItem,
} from '../../app/src/redemptions/demoRedemptionStore.ts';
import {
  appendDemoManualAward,
  getDemoRewardStore,
  resetDemoRewardStore,
  reverseDemoManualAward,
} from '../../app/src/rewards/demoRewardStore.ts';
import {
  getRedemptionRequestStatus,
} from '../../app/src/redemptions/redemptionSelectors.ts';
import {
  RedemptionAccountingIntegrityError,
  RedemptionAccountingService,
  getRedemptionDebitEventKey,
  getRedemptionRefundEventKey,
  inspectRedemptionAccounting,
} from '../../server/src/services/redemptionAccountingService.ts';
import {
  RedemptionConflictError,
  RedemptionFileStore,
  RedemptionStoreCorruptError,
} from '../../server/src/services/redemptionStore.ts';
import {
  RewardFileStore,
  RewardInsufficientBalanceError,
  RewardStoreCorruptError,
  RewardStoreError,
} from '../../server/src/services/rewardStore.ts';

const ITEM = '11111111-1111-4111-8111-111111111111';
const REQUEST_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REQUEST_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW = new Date('2026-08-28T12:00:00.000Z');
const LATER = new Date('2026-08-28T13:00:00.000Z');
const temporaryDirectories: string[] = [];

async function makeStores(cost = 80) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'ey-redemption-accounting-')
  );
  temporaryDirectories.push(directory);
  const rewardPath = path.join(directory, 'rewards.local.json');
  const redemptionPath = path.join(
    directory,
    'redemptions.local.json'
  );
  const rewards = new RewardFileStore(rewardPath);
  const redemptions = new RedemptionFileStore(redemptionPath);
  await redemptions.createCatalogueItem({
    id: ITEM,
    name: 'Safe test reward',
    description: 'Safe synthetic description',
    starCost: cost,
  }, NOW);
  return {
    directory,
    rewardPath,
    redemptionPath,
    rewards,
    redemptions,
  };
}

async function addBalance(
  rewards: RewardFileStore,
  amount: number,
  profileId = 'child-1',
  event = crypto.randomUUID()
) {
  return rewards.appendAward(
    `award-${event}`,
    {
      profileId,
      amount,
      category: 'helping',
      reason: 'Safe synthetic award',
      source: {
        kind: 'manual-parent-award',
        eventKey: `manual-award:${event}`,
      },
      actorProfileId: 'adult-1',
      timeZone: 'Europe/London',
    },
    NOW
  );
}

async function addRequest(
  redemptions: RedemptionFileStore,
  id = REQUEST_A,
  profileId = 'child-1'
) {
  return redemptions.createRequest({
    id,
    catalogueItemId: ITEM,
    profileId,
    requestedByProfileId: profileId,
    timeZone: 'Europe/London',
  }, NOW);
}

function makeService(
  redemptions: RedemptionFileStore,
  rewards: RewardFileStore,
  prefix = 'accounting'
) {
  let sequence = 0;
  return new RedemptionAccountingService(
    redemptions,
    rewards,
    () => `${prefix}-${++sequence}`
  );
}

afterEach(async () => {
  resetDemoRedemptionStore();
  resetDemoRewardStore();
  await Promise.all(
    temporaryDirectories.splice(0).map(directory =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe('Redemption approval accounting', () => {
  it('approves from the immutable request contract and writes the canonical private-safe debit', async () => {
    const { rewards, redemptions } = await makeStores(40);
    await addBalance(rewards, 100);
    await addRequest(redemptions);
    await redemptions.updateCatalogueItem(ITEM, {
      name: 'Changed after request',
      description: 'Changed after request',
      starCost: 500,
    }, LATER);
    await redemptions.setCatalogueItemActive(ITEM, false, LATER);

    const result = await makeService(
      redemptions,
      rewards
    ).approve(REQUEST_A, 'adult-1', LATER);
    assert.equal(result.status, 'approved');
    assert.equal(result.created, true);
    assert.deepEqual(result.transaction, {
      id: 'accounting-1',
      profileId: 'child-1',
      entryType: 'redemption',
      currency: 'star',
      amount: -40,
      category: 'redemption',
      reason: null,
      source: {
        kind: 'redemption',
        eventKey: getRedemptionDebitEventKey(REQUEST_A),
        label: 'Reward redemption',
      },
      relation: null,
      actorProfileId: 'adult-1',
      createdAt: LATER.toISOString(),
      localDate: '2026-08-28',
      timeZone: 'Europe/London',
    });
    assert.doesNotMatch(
      JSON.stringify(result.transaction),
      /Changed after request|Safe test reward|Safe synthetic description/
    );
  });

  it('allows exact balance, rejects insufficient/negative balances and leaves the ledger unchanged', async () => {
    const exact = await makeStores(80);
    await addBalance(exact.rewards, 80);
    await addRequest(exact.redemptions);
    await makeService(
      exact.redemptions,
      exact.rewards
    ).approve(REQUEST_A, 'adult-1', LATER);
    const exactTransactions =
      (await exact.rewards.read()).transactions;
    assert.equal(
      exactTransactions.reduce((sum, item) => sum + item.amount, 0),
      0
    );

    const insufficient = await makeStores(80);
    await addBalance(insufficient.rewards, 79);
    await addRequest(insufficient.redemptions);
    const before = await readFile(
      insufficient.rewardPath,
      'utf8'
    );
    await assert.rejects(
      makeService(
        insufficient.redemptions,
        insufficient.rewards
      ).approve(REQUEST_A, 'adult-1', LATER),
      RewardInsufficientBalanceError
    );
    assert.equal(
      await readFile(insufficient.rewardPath, 'utf8'),
      before
    );
  });

  it('evaluates idempotency before affordability and rejects a conflicting canonical key', async () => {
    const { rewards, redemptions } = await makeStores(80);
    await addBalance(rewards, 100);
    await addRequest(redemptions);
    const service = makeService(redemptions, rewards);
    const first = await service.approve(
      REQUEST_A,
      'adult-1',
      LATER
    );
    const retry = await service.approve(
      REQUEST_A,
      'adult-2',
      LATER
    );
    assert.equal(retry.created, false);
    assert.equal(retry.transaction.id, first.transaction.id);

    const conflicting = await makeStores(20);
    await addRequest(conflicting.redemptions);
    await conflicting.rewards.appendAward(
      'conflict',
      {
        profileId: 'child-1',
        amount: 20,
        category: 'correction',
        reason: null,
        source: {
          kind: 'correction',
          eventKey: getRedemptionDebitEventKey(REQUEST_A),
          label: 'Safe correction',
        },
        actorProfileId: 'adult-1',
        timeZone: 'Europe/London',
      },
      NOW
    );
    await assert.rejects(
      makeService(
        conflicting.redemptions,
        conflicting.rewards
      ).approve(REQUEST_A, 'adult-1'),
      RedemptionAccountingIntegrityError
    );
  });

  it('serializes competing approvals so only one can spend the same balance', async () => {
    const { rewards, redemptions } = await makeStores(80);
    await addBalance(rewards, 100);
    await addRequest(redemptions, REQUEST_A);
    await addRequest(redemptions, REQUEST_B);
    const service = makeService(redemptions, rewards);
    const results = await Promise.allSettled([
      service.approve(REQUEST_A, 'adult-1', LATER),
      service.approve(REQUEST_B, 'adult-1', LATER),
    ]);
    assert.equal(
      results.filter(result => result.status === 'fulfilled').length,
      1
    );
    assert.equal(
      results.filter(result =>
        result.status === 'rejected' &&
        result.reason instanceof RewardInsufficientBalanceError
      ).length,
      1
    );
    const transactions = (await rewards.read()).transactions;
    assert.equal(
      transactions.filter(item => item.entryType === 'redemption').length,
      1
    );
    assert.equal(
      transactions.reduce((sum, item) => sum + item.amount, 0),
      20
    );
  });

  it('serializes duplicate approvals for one request without duplicate debits', async () => {
    const { rewards, redemptions } = await makeStores(40);
    await addBalance(rewards, 100);
    await addRequest(redemptions);
    const service = makeService(redemptions, rewards);
    const results = await Promise.all([
      service.approve(REQUEST_A, 'adult-1', LATER),
      service.approve(REQUEST_A, 'adult-1', LATER),
    ]);
    assert.deepEqual(
      results.map(result => result.created),
      [true, false]
    );
    assert.equal(
      (await rewards.read()).transactions.filter(
        item => item.entryType === 'redemption'
      ).length,
      1
    );
  });

  it('keeps the ledger safe-integer bound independent from the catalogue UI maximum', async () => {
    const { rewards } = await makeStores();
    await addBalance(rewards, 600);
    const result = await rewards.appendRedemption(
      'large-redemption',
      {
        profileId: 'child-1',
        starCost: 501,
        eventKey: 'redemption:safe-ledger-test:debit',
        actorProfileId: 'adult-1',
        timeZone: 'Europe/London',
      },
      LATER
    );
    assert.equal(result.transaction.amount, -501);
    await assert.rejects(
      rewards.appendRedemption('unsafe', {
        profileId: 'child-1',
        starCost: Number.MAX_SAFE_INTEGER + 1,
        eventKey: 'redemption:unsafe:debit',
        actorProfileId: 'adult-1',
        timeZone: 'Europe/London',
      }),
      RewardStoreError
    );
  });

  it('keeps removed stable profile IDs authoritative for approval and refund', async () => {
    const { rewards, redemptions } = await makeStores(20);
    await addBalance(rewards, 20, 'removed-child');
    await addRequest(
      redemptions,
      REQUEST_A,
      'removed-child'
    );
    const service = makeService(redemptions, rewards);
    await service.approve(REQUEST_A, 'adult-1', LATER);
    await service.refund(REQUEST_A, 'adult-1', LATER);
    const transactions = (await rewards.read()).transactions;
    assert.equal(
      transactions.filter(item =>
        item.profileId === 'removed-child'
      ).reduce((sum, item) => sum + item.amount, 0),
      20
    );
  });
});

describe('Redemption lifecycle and refund', () => {
  it('allows one legal winner for approve/cancel and approve/decline races', async () => {
    for (const operation of ['cancel', 'decline'] as const) {
      const { rewards, redemptions } = await makeStores(40);
      await addBalance(rewards, 100);
      await addRequest(redemptions);
      const service = makeService(
        redemptions,
        rewards,
        operation
      );
      const competing = operation === 'cancel'
        ? service.cancel(REQUEST_A, 'child-1', LATER)
        : service.decline(REQUEST_A, 'adult-1', LATER);
      const results = await Promise.allSettled([
        service.approve(REQUEST_A, 'adult-1', LATER),
        competing,
      ]);
      assert.equal(
        results.filter(result => result.status === 'fulfilled').length,
        1
      );
      const request = (await redemptions.read()).requests[0];
      const debit = (await rewards.read()).transactions.find(
        item => item.entryType === 'redemption'
      );
      assert.notEqual(Boolean(request.closure), Boolean(debit));
    }
  });

  it('rejects approval after cancellation/decline and pending transitions after approval', async () => {
    const cancelled = await makeStores(20);
    await addBalance(cancelled.rewards, 100);
    await addRequest(cancelled.redemptions);
    const cancelledService = makeService(
      cancelled.redemptions,
      cancelled.rewards
    );
    await cancelledService.cancel(
      REQUEST_A,
      'child-1',
      LATER
    );
    await assert.rejects(
      cancelledService.approve(REQUEST_A, 'adult-1'),
      RedemptionConflictError
    );
    await assert.rejects(
      cancelledService.refund(REQUEST_A, 'adult-1'),
      RedemptionConflictError
    );

    const approved = await makeStores(20);
    await addBalance(approved.rewards, 100);
    await addRequest(approved.redemptions);
    const approvedService = makeService(
      approved.redemptions,
      approved.rewards
    );
    await approvedService.approve(REQUEST_A, 'adult-1');
    await assert.rejects(
      approvedService.cancel(REQUEST_A, 'child-1'),
      RedemptionConflictError
    );
    await assert.rejects(
      approvedService.decline(REQUEST_A, 'adult-1'),
      RedemptionConflictError
    );
  });

  it('creates one exact refund, retains the debit and derives Refunded idempotently', async () => {
    const { rewards, redemptions } = await makeStores(40);
    await addBalance(rewards, 100);
    await addRequest(redemptions);
    const service = makeService(redemptions, rewards);
    const debit = await service.approve(
      REQUEST_A,
      'adult-1',
      NOW
    );
    const [first, retry] = await Promise.all([
      service.refund(REQUEST_A, 'adult-1', LATER),
      service.refund(REQUEST_A, 'adult-1', LATER),
    ]);
    assert.deepEqual(
      [first.created, retry.created],
      [true, false]
    );
    const ledger = (await rewards.read()).transactions;
    const refund = ledger.find(item =>
      item.source.eventKey ===
        getRedemptionRefundEventKey(REQUEST_A)
    );
    assert.equal(refund?.amount, 40);
    assert.equal(refund?.profileId, 'child-1');
    assert.equal(refund?.currency, 'star');
    assert.equal(
      refund?.relation?.transactionId,
      debit.transaction.id
    );
    assert.equal(
      ledger.some(item => item.id === debit.transaction.id),
      true
    );
    const request = (await redemptions.read()).requests[0];
    assert.equal(
      inspectRedemptionAccounting(request, ledger).status,
      'refunded'
    );
    assert.equal(
      getRedemptionRequestStatus(request, ledger),
      'refunded'
    );
    const laterApproval = await service.approve(
      REQUEST_A,
      'adult-2'
    );
    assert.equal(laterApproval.status, 'refunded');
    assert.equal(laterApproval.created, false);
  });

  it('allows a later legitimate earning reversal to make balance negative and blocks another approval', async () => {
    const { rewards, redemptions } = await makeStores(100);
    const award = await addBalance(
      rewards,
      100,
      'child-1',
      'spent-award'
    );
    await addRequest(redemptions, REQUEST_A);
    await addRequest(redemptions, REQUEST_B);
    const service = makeService(redemptions, rewards);
    await service.approve(REQUEST_A, 'adult-1', LATER);
    await rewards.reverseTransaction(
      'late-reversal',
      award.transaction.id,
      {
        eventKey: 'manual-reversal:spent-award',
        reason: 'Manual award reversed',
        actorProfileId: 'adult-1',
        timeZone: 'Europe/London',
      },
      LATER
    );
    const ledger = (await rewards.read()).transactions;
    assert.equal(
      ledger.reduce((sum, item) => sum + item.amount, 0),
      -100
    );
    await assert.rejects(
      service.approve(REQUEST_B, 'adult-1'),
      RewardInsufficientBalanceError
    );
  });
});

describe('Redemption failure and restart recovery', () => {
  it('recovers approval after the debit persisted but the first caller lost its response', async () => {
    const { rewardPath, rewards, redemptions } =
      await makeStores(40);
    await addBalance(rewards, 100);
    await addRequest(redemptions);
    let failAfterWrite = true;
    const flakyRewards = {
      read: () => rewards.read(),
      appendRedemption: async (...args: Parameters<RewardFileStore['appendRedemption']>) => {
        const result = await rewards.appendRedemption(...args);
        if (failAfterWrite) {
          failAfterWrite = false;
          throw new Error('Simulated lost approval response');
        }
        return result;
      },
      reverseTransaction: rewards.reverseTransaction.bind(rewards),
    };
    await assert.rejects(
      new RedemptionAccountingService(
        redemptions,
        flakyRewards,
        () => 'flaky-debit'
      ).approve(REQUEST_A, 'adult-1', LATER),
      /Simulated lost approval response/
    );
    const restartedRewards = new RewardFileStore(rewardPath);
    const retry = await makeService(
      redemptions,
      restartedRewards,
      'restart'
    ).approve(REQUEST_A, 'adult-1', LATER);
    assert.equal(retry.created, false);
    assert.equal(
      (await restartedRewards.read()).transactions.filter(
        item => item.entryType === 'redemption'
      ).length,
      1
    );
  });

  it('recovers refund after the reversal persisted but the first caller lost its response', async () => {
    const { rewardPath, rewards, redemptions } =
      await makeStores(40);
    await addBalance(rewards, 100);
    await addRequest(redemptions);
    await makeService(redemptions, rewards).approve(
      REQUEST_A,
      'adult-1',
      NOW
    );
    let failAfterWrite = true;
    const flakyRewards = {
      read: () => rewards.read(),
      appendRedemption: rewards.appendRedemption.bind(rewards),
      reverseTransaction: async (...args: Parameters<RewardFileStore['reverseTransaction']>) => {
        const result = await rewards.reverseTransaction(...args);
        if (failAfterWrite) {
          failAfterWrite = false;
          throw new Error('Simulated lost refund response');
        }
        return result;
      },
    };
    await assert.rejects(
      new RedemptionAccountingService(
        redemptions,
        flakyRewards,
        () => 'flaky-refund'
      ).refund(REQUEST_A, 'adult-1', LATER),
      /Simulated lost refund response/
    );
    const restartedRewards = new RewardFileStore(rewardPath);
    const retry = await makeService(
      redemptions,
      restartedRewards,
      'restart-refund'
    ).refund(REQUEST_A, 'adult-1', LATER);
    assert.equal(retry.created, false);
    assert.equal(retry.status, 'refunded');
  });

  it('keeps Approved when a refund write fails and creates no debit when cancellation persistence fails', async () => {
    const refundCase = await makeStores(40);
    await addBalance(refundCase.rewards, 100);
    await addRequest(refundCase.redemptions);
    await makeService(
      refundCase.redemptions,
      refundCase.rewards
    ).approve(REQUEST_A, 'adult-1', NOW);
    const failingRefundRewards = {
      read: () => refundCase.rewards.read(),
      appendRedemption:
        refundCase.rewards.appendRedemption.bind(
          refundCase.rewards
        ),
      reverseTransaction: async () => {
        throw new Error('Simulated refund persistence failure');
      },
    };
    await assert.rejects(
      new RedemptionAccountingService(
        refundCase.redemptions,
        failingRefundRewards,
        () => 'unused-refund-id'
      ).refund(REQUEST_A, 'adult-1', LATER),
      /Simulated refund persistence failure/
    );
    const approvedRequest =
      (await refundCase.redemptions.read()).requests[0];
    assert.equal(
      inspectRedemptionAccounting(
        approvedRequest,
        (await refundCase.rewards.read()).transactions
      ).status,
      'approved'
    );

    const cancellationCase = await makeStores(40);
    await addBalance(cancellationCase.rewards, 100);
    await addRequest(cancellationCase.redemptions);
    const failingRedemptions = {
      read: () => cancellationCase.redemptions.read(),
      cancelRequest: async () => {
        throw new Error('Simulated cancellation persistence failure');
      },
      declineRequest:
        cancellationCase.redemptions.declineRequest.bind(
          cancellationCase.redemptions
        ),
    };
    await assert.rejects(
      new RedemptionAccountingService(
        failingRedemptions,
        cancellationCase.rewards,
        () => 'unused-cancel-id'
      ).cancel(REQUEST_A, 'child-1', LATER),
      /Simulated cancellation persistence failure/
    );
    assert.equal(
      (await cancellationCase.redemptions.read())
        .requests[0].closure,
      null
    );
    assert.equal(
      (await cancellationCase.rewards.read())
        .transactions.some(
          item => item.entryType === 'redemption'
        ),
      false
    );
  });

  it('isolates malformed Rewards from Redemption and malformed Redemption from Rewards', async () => {
    const first = await makeStores(20);
    await addRequest(first.redemptions);
    await writeFile(first.rewardPath, '{bad', 'utf8');
    const redemptionBefore = await readFile(
      first.redemptionPath,
      'utf8'
    );
    await assert.rejects(
      makeService(
        first.redemptions,
        first.rewards
      ).cancel(REQUEST_A, 'child-1'),
      RewardStoreCorruptError
    );
    assert.equal(
      await readFile(first.redemptionPath, 'utf8'),
      redemptionBefore
    );

    const second = await makeStores(20);
    await addBalance(second.rewards, 100);
    const rewardBefore = await readFile(
      second.rewardPath,
      'utf8'
    );
    await writeFile(second.redemptionPath, '{bad', 'utf8');
    await assert.rejects(
      makeService(
        second.redemptions,
        second.rewards
      ).approve(REQUEST_A, 'adult-1'),
      RedemptionStoreCorruptError
    );
    assert.equal(
      await readFile(second.rewardPath, 'utf8'),
      rewardBefore
    );
  });
});

describe('Demo Redemption accounting isolation', () => {
  it('approves, refunds and derives status entirely in memory', async () => {
    resetDemoRedemptionStore();
    resetDemoRewardStore();
    appendDemoManualAward({
      profileId: 'child-1',
      amount: 40,
      category: 'helping',
      reason: 'Safe Demo balance',
      actorProfileId: 'adult-1',
      timeZone: 'Europe/London',
      requestId: 'demo-redemption-balance',
    }, NOW);
    createDemoRedemptionRequest({
      id: REQUEST_A,
      catalogueItemId: ITEM,
      profileId: 'child-1',
      requestedByProfileId: 'child-1',
      timeZone: 'Europe/London',
    }, NOW);
    await approveDemoRedemptionRequest(
      REQUEST_A,
      'adult-1',
      LATER
    );
    const request = getDemoRedemptionStore().requests[0];
    assert.equal(
      getRedemptionRequestStatus(
        request,
        getDemoRewardStore().transactions
      ),
      'approved'
    );
    await refundDemoRedemptionRequest(
      REQUEST_A,
      'adult-1',
      LATER
    );
    assert.equal(
      getRedemptionRequestStatus(
        request,
        getDemoRewardStore().transactions
      ),
      'refunded'
    );
    assert.equal(
      getDemoRewardStore().transactions.filter(item =>
        item.source.eventKey.startsWith(`redemption:${REQUEST_A}:`)
      ).length,
      2
    );
  });

  it('enforces affordability and serializes competing lifecycle operations', async () => {
    resetDemoRedemptionStore();
    resetDemoRewardStore();
    createDemoRedemptionRequest({
      id: REQUEST_A,
      catalogueItemId: ITEM,
      profileId: 'child-1',
      requestedByProfileId: 'child-1',
      timeZone: 'Europe/London',
    }, NOW);
    await assert.rejects(
      approveDemoRedemptionRequest(
        REQUEST_A,
        'adult-1',
        LATER
      ),
      /not enough stars/
    );

    appendDemoManualAward({
      profileId: 'child-1',
      amount: 40,
      category: 'helping',
      reason: 'Safe Demo balance',
      actorProfileId: 'adult-1',
      timeZone: 'Europe/London',
      requestId: 'demo-redemption-race',
    }, NOW);
    const outcomes = await Promise.allSettled([
      approveDemoRedemptionRequest(
        REQUEST_A,
        'adult-1',
        LATER
      ),
      cancelDemoRedemptionLifecycle(
        REQUEST_A,
        'child-1',
        LATER
      ),
    ]);
    assert.equal(
      outcomes.filter(item => item.status === 'fulfilled').length,
      1
    );
    await assert.rejects(
      declineDemoRedemptionLifecycle(
        REQUEST_A,
        'adult-1',
        LATER
      )
    );
  });

  it('prevents competing Demo approvals from double-spending', async () => {
    resetDemoRedemptionStore();
    resetDemoRewardStore();
    updateDemoCatalogueItem(ITEM, {
      name: 'Safe high-cost reward',
      description: null,
      starCost: 80,
    }, NOW);
    appendDemoManualAward({
      profileId: 'child-1',
      amount: 100,
      category: 'helping',
      reason: 'Safe Demo balance',
      actorProfileId: 'adult-1',
      timeZone: 'Europe/London',
      requestId: 'demo-double-spend-balance',
    }, NOW);
    for (const id of [REQUEST_A, REQUEST_B]) {
      createDemoRedemptionRequest({
        id,
        catalogueItemId: ITEM,
        profileId: 'child-1',
        requestedByProfileId: 'child-1',
        timeZone: 'Europe/London',
      }, NOW);
    }
    const outcomes = await Promise.allSettled([
      approveDemoRedemptionRequest(
        REQUEST_A,
        'adult-1',
        LATER
      ),
      approveDemoRedemptionRequest(
        REQUEST_B,
        'adult-1',
        LATER
      ),
    ]);
    assert.equal(
      outcomes.filter(item => item.status === 'fulfilled').length,
      1
    );
    assert.equal(
      getDemoRewardStore().transactions.filter(
        item => item.entryType === 'redemption'
      ).length,
      1
    );
  });

  it('retains the accepted later-negative-balance behaviour in Demo', async () => {
    resetDemoRedemptionStore();
    resetDemoRewardStore();
    const award = appendDemoManualAward({
      profileId: 'child-1',
      amount: 40,
      category: 'helping',
      reason: 'Safe Demo balance',
      actorProfileId: 'adult-1',
      timeZone: 'Europe/London',
      requestId: 'demo-spent-award',
    }, NOW);
    createDemoRedemptionRequest({
      id: REQUEST_A,
      catalogueItemId: ITEM,
      profileId: 'child-1',
      requestedByProfileId: 'child-1',
      timeZone: 'Europe/London',
    }, NOW);
    await approveDemoRedemptionRequest(
      REQUEST_A,
      'adult-1',
      LATER
    );
    reverseDemoManualAward({
      transactionId: award.id,
      actorProfileId: 'adult-1',
      timeZone: 'Europe/London',
      requestId: 'demo-spent-award-reversal',
    }, LATER);
    assert.equal(
      getDemoRewardStore().transactions.reduce(
        (sum, item) => sum + item.amount,
        0
      ),
      -35
    );
  });
});
