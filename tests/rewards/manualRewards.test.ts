import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  HouseholdProfile,
} from '../../app/src/household/householdProfiles.ts';
import {
  canManageRewards,
  createManualAwardEventKey,
  getEligibleRewardRecipients,
  getReversedRewardIds,
  selectRewardBalanceProfiles,
  selectVisibleRewardHistory,
  validateManualAward,
} from '../../app/src/rewards/manualRewards.ts';
import type {
  RewardTransaction,
} from '../../app/src/types/reward.ts';

const profiles: HouseholdProfile[] = [
  { id: 'family', kind: 'family', displayName: 'Example Household' },
  { id: 'adult-1', kind: 'member', displayName: 'Alex', memberType: 'adult' },
  { id: 'child-1', kind: 'member', displayName: 'Sam', memberType: 'child' },
  { id: 'child-2', kind: 'member', displayName: 'Taylor', memberType: 'child' },
];

function transaction(
  id: string,
  profileId: string,
  amount = 5
): RewardTransaction {
  return {
    id,
    profileId,
    entryType: amount > 0 ? 'award' : 'reversal',
    currency: 'star',
    amount,
    category: amount > 0 ? 'helping' : 'correction',
    reason: 'Safe synthetic reason',
    source: amount > 0
      ? { kind: 'manual-parent-award', eventKey: `manual-award:${id}` }
      : { kind: 'correction', eventKey: `manual-reversal:${id}`, label: 'Reward reversal' },
    relation: amount > 0
      ? null
      : { kind: 'reversal-of', transactionId: 'award-1' },
    actorProfileId: 'adult-1',
    createdAt: `2026-08-28T1${id.length}:00:00.000Z`,
    localDate: '2026-08-28',
    timeZone: 'Europe/London',
  };
}

describe('Manual Reward profile policy', () => {
  it('offers only current child member profiles', () => {
    assert.deepEqual(
      getEligibleRewardRecipients(profiles).map(profile => profile.id),
      ['child-1', 'child-2']
    );
  });

  it('exposes management only for an adult context', () => {
    assert.equal(canManageRewards(profiles[0]), false);
    assert.equal(canManageRewards(profiles[1]), true);
    assert.equal(canManageRewards(profiles[2]), false);
  });

  it('keeps Family/adult combined views and isolates child sibling history', () => {
    const transactions = [
      transaction('one', 'child-1'),
      transaction('two', 'child-2'),
      transaction('three', 'removed-child'),
    ];

    assert.deepEqual(
      selectVisibleRewardHistory({ transactions, profiles, selectedProfile: profiles[0] })
        .map(item => item.profileId).sort(),
      ['child-1', 'child-2']
    );
    assert.deepEqual(
      selectVisibleRewardHistory({ transactions, profiles, selectedProfile: profiles[1] })
        .map(item => item.profileId).sort(),
      ['child-1', 'child-2', 'removed-child']
    );
    assert.deepEqual(
      selectVisibleRewardHistory({ transactions, profiles, selectedProfile: profiles[2] })
        .map(item => item.profileId),
      ['child-1']
    );
  });

  it('uses stable IDs across rename, removal and restoration', () => {
    const renamed = profiles.map(profile =>
      profile.id === 'child-1'
        ? { ...profile, displayName: 'Renamed child' }
        : profile
    );
    const removed = renamed.filter(profile => profile.id !== 'child-1');
    const restored = [...removed, renamed[2]];

    assert.equal(
      selectRewardBalanceProfiles(renamed, renamed[2])[0].displayName,
      'Renamed child'
    );
    assert.equal(
      getEligibleRewardRecipients(removed).some(profile => profile.id === 'child-1'),
      false
    );
    assert.equal(
      getEligibleRewardRecipients(restored).some(profile => profile.id === 'child-1'),
      true
    );
  });
});

describe('Manual Reward form policy', () => {
  const base = {
    profileId: 'child-1',
    amount: 10,
    category: 'helping' as const,
    reason: '  Helpful choice  ',
    actorProfileId: 'adult-1',
    timeZone: 'Europe/London',
    requestId: 'request-1',
  };

  it('accepts boundaries, trims reasons and creates a stable event key', () => {
    assert.equal(validateManualAward({ ...base, amount: 1 }).reason, 'Helpful choice');
    assert.equal(validateManualAward({ ...base, amount: 100 }).amount, 100);
    assert.equal(createManualAwardEventKey(base.requestId), 'manual-award:request-1');
  });

  it('rejects invalid amounts, categories and reasons', () => {
    for (const invalid of [
      { ...base, amount: 0 },
      { ...base, amount: 101 },
      { ...base, amount: 1.5 },
      { ...base, reason: ' ' },
      { ...base, reason: 'x'.repeat(161) },
      { ...base, category: 'routine' },
    ]) {
      assert.throws(() => validateManualAward(invalid as typeof base));
    }
  });

  it('detects reversed awards without a mutable balance field', () => {
    const transactions = [
      transaction('award-1', 'child-1'),
      transaction('reverse', 'child-1', -5),
    ];

    assert.deepEqual([...getReversedRewardIds(transactions)], ['award-1']);
    assert.equal('balance' in transactions[0], false);
  });
});
