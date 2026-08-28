import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getRewardBalance,
  getRewardBalances,
  getRewardHistory,
} from '../../server/src/rewards/rewardSelectors.ts';
import {
  getRewardBalance as getFrontendRewardBalance,
  getRewardBalances as getFrontendRewardBalances,
  getRewardHistory as getFrontendRewardHistory,
} from '../../app/src/rewards/rewardSelectors.ts';
import type {
  RewardTransaction,
} from '../../server/src/types/reward.ts';

function transaction(
  id: string,
  profileId: string,
  amount: number,
  createdAt: string
): RewardTransaction {
  return {
    id,
    profileId,
    entryType: amount > 0 ? 'award' : 'reversal',
    currency: 'star',
    amount,
    category: amount > 0 ? 'helping' : 'correction',
    reason: 'Safe test reason',
    source: amount > 0
      ? {
        kind: 'manual-parent-award',
        eventKey: `award:${id}`,
      }
      : {
        kind: 'correction',
        eventKey: `reversal:${id}`,
        label: 'Reward reversal',
      },
    relation: amount > 0
      ? null
      : {
        kind: 'reversal-of',
        transactionId: 'award-target',
      },
    actorProfileId: null,
    createdAt,
    localDate: createdAt.slice(0, 10),
    timeZone: 'UTC',
  };
}

describe('reward selectors', () => {
  const transactions = [
    transaction(
      'one',
      'child-1',
      10,
      '2026-08-27T10:00:00.000Z'
    ),
    transaction(
      'two',
      'child-2',
      7,
      '2026-08-27T11:00:00.000Z'
    ),
    transaction(
      'three',
      'child-1',
      -4,
      '2026-08-27T12:00:00.000Z'
    ),
  ];

  it('derives balances exclusively from transactions', () => {
    assert.equal(
      getRewardBalance(transactions, 'child-1'),
      6
    );
    assert.equal(
      getRewardBalance(transactions, 'unknown'),
      0
    );
    assert.deepEqual(
      getRewardBalances(transactions),
      {
        'child-1': 6,
        'child-2': 7,
      }
    );
  });

  it('isolates and orders profile history without mutating input', () => {
    const originalIds = transactions.map(item => item.id);
    const history = getRewardHistory(
      transactions,
      'child-1'
    );

    assert.deepEqual(
      history.map(item => item.id),
      ['three', 'one']
    );
    assert.deepEqual(
      transactions.map(item => item.id),
      originalIds
    );
  });

  it('keeps frontend foundation selectors aligned with the validated backend ledger', () => {
    assert.equal(
      getFrontendRewardBalance(
        transactions,
        'child-1'
      ),
      6
    );
    assert.deepEqual(
      getFrontendRewardBalances(transactions),
      {
        'child-1': 6,
        'child-2': 7,
      }
    );
    assert.deepEqual(
      getFrontendRewardHistory(
        transactions,
        'child-1'
      ).map(item => item.id),
      ['three', 'one']
    );
  });
});
