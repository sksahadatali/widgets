import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  appendDemoManualAward,
  getDemoRewardStore,
  resetDemoRewardStore,
  reconcileDemoRoutineRewards,
  reverseDemoManualAward,
  validateDemoRewardStore,
} from '../../app/src/rewards/demoRewardStore.ts';

describe('Demo reward store', () => {
  it('contains only isolated synthetic example data', async () => {
    const store = getDemoRewardStore();
    const source = await readFile(
      new URL(
        '../../app/src/rewards/demoRewardStore.ts',
        import.meta.url
      ),
      'utf8'
    );
    const serialized = JSON.stringify(store);

    assert.equal(store.schemaVersion, 1);
    assert.equal(store.transactions.length, 1);
    assert.equal(
      store.transactions[0].profileId,
      'child-1'
    );
    assert.doesNotMatch(
      source,
      /rewards\.local\.json|\/api\/rewards|localStorage/
    );
    assert.doesNotMatch(
      serialized,
      /@|password|token|secret|kumon|school/i
    );
  });

  it('returns a clone and rejects malformed Demo data', () => {
    const first = getDemoRewardStore();
    first.transactions.length = 0;
    assert.equal(
      getDemoRewardStore().transactions.length,
      1
    );
    assert.throws(
      () => validateDemoRewardStore({
        schemaVersion: 1,
        transactions: [
          {
            id: 'bad',
            profileId: 'family',
          },
        ],
      }),
      /Safe Demo reward data is invalid/
    );
  });

  it('keeps disposable mutations isolated and idempotent', () => {
    resetDemoRewardStore();
    const input = {
      profileId: 'child-1',
      amount: 10,
      category: 'achievement' as const,
      reason: 'Safe example achievement',
      actorProfileId: 'adult-1',
      timeZone: 'Europe/London',
      requestId: 'demo-request-1',
    };
    const first = appendDemoManualAward(input);
    const retry = appendDemoManualAward(input);

    assert.equal(first.id, retry.id);
    assert.equal(getDemoRewardStore().transactions.length, 2);

    const reversalInput = {
      transactionId: first.id,
      actorProfileId: 'adult-1',
      timeZone: 'Europe/London',
      requestId: 'demo-reversal-1',
    };
    const reversal = reverseDemoManualAward(reversalInput);
    const reversalRetry = reverseDemoManualAward(reversalInput);

    assert.equal(reversal.id, reversalRetry.id);
    assert.equal(reversal.amount, -10);
    assert.throws(() => reverseDemoManualAward({
      ...reversalInput,
      requestId: 'demo-reversal-2',
    }));
    resetDemoRewardStore();
  });

  it('reconciles an isolated automatic completion cycle without Household data', () => {
    resetDemoRewardStore();
    const occurrence = {
      id: 'demo-routine@2026-08-28',
      routineId: 'demo-routine',
      localDate: '2026-08-28',
      timeZone: 'Europe/London',
      snapshot: {
        title: 'Safe demo routine',
        ownerProfileId: 'child-1',
        schedule: {
          daysOfWeek: [5] as const,
          startTime: null,
          endTime: null,
        },
        steps: [{ id: 'step-1', title: 'Safe step' }],
        definitionUpdatedAt: '2026-08-28T08:00:00.000Z',
        capturedAt: '2026-08-28T08:00:00.000Z',
        source: 'captured' as const,
      },
      rewardContract: {
        recipientProfileId: 'child-1',
        currency: 'star' as const,
        amount: 4,
      },
      completionSequence: 1,
      completedSteps: {
        'step-1': '2026-08-28T09:00:00.000Z',
      },
      completedAt: '2026-08-28T09:00:00.000Z',
      updatedAt: '2026-08-28T09:00:00.000Z',
    };
    const data = {
      routines: [],
      occurrences: [occurrence],
    };

    reconcileDemoRoutineRewards(data, new Date('2026-08-28T09:00:00.000Z'));
    reconcileDemoRoutineRewards(data, new Date('2026-08-28T09:01:00.000Z'));
    assert.equal(getDemoRewardStore().transactions.length, 2);

    occurrence.completedSteps = {};
    occurrence.completedAt = null;
    reconcileDemoRoutineRewards(data, new Date('2026-08-28T09:02:00.000Z'));
    assert.equal(getDemoRewardStore().transactions.length, 3);
    resetDemoRewardStore();
  });
});
