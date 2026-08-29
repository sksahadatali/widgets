import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  HouseholdProfile,
} from '../../app/src/household/householdProfiles.ts';
import {
  getRedemptionRequestStatus,
  selectActiveCatalogue,
  selectVisibleRedemptionRequests,
} from '../../app/src/redemptions/redemptionSelectors.ts';
import type {
  RedemptionRequest,
} from '../../app/src/types/redemption.ts';

const profiles: HouseholdProfile[] = [
  { id: 'family', kind: 'family', displayName: 'Example Household' },
  { id: 'adult-1', kind: 'member', displayName: 'Alex', memberType: 'adult' },
  { id: 'child-1', kind: 'member', displayName: 'Sam', memberType: 'child' },
  { id: 'child-2', kind: 'member', displayName: 'Taylor', memberType: 'child' },
];

function request(
  id: string,
  profileId: string,
  closure: RedemptionRequest['closure'] = null
): RedemptionRequest {
  return {
    id,
    eventKey: `redemption-request:${id}`,
    profileId,
    requestedByProfileId: profileId,
    contract: {
      catalogueItemId: '11111111-1111-4111-8111-111111111111',
      name: 'Safe reward',
      description: null,
      currency: 'star',
      starCost: 20,
    },
    requestedAt: '2026-08-28T10:00:00.000Z',
    localDate: '2026-08-28',
    timeZone: 'Europe/London',
    closure,
  };
}

describe('Redemption selectors', () => {
  const requests = [
    request('one', 'child-1'),
    request('two', 'child-2'),
    request('three', 'removed-child'),
  ];

  it('preserves catalogue order while filtering active items', () => {
    const catalogue = [
      { id: 'one', active: true },
      { id: 'two', active: false },
      { id: 'three', active: true },
    ] as never;
    assert.deepEqual(
      selectActiveCatalogue(catalogue).map(item => item.id),
      ['one', 'three']
    );
  });

  it('gives Family current children, isolates siblings and gives adults retained records', () => {
    assert.deepEqual(
      selectVisibleRedemptionRequests({
        requests,
        profiles,
        selectedProfile: profiles[0],
      }).map(item => item.profileId).sort(),
      ['child-1', 'child-2']
    );
    assert.deepEqual(
      selectVisibleRedemptionRequests({
        requests,
        profiles,
        selectedProfile: profiles[2],
      }).map(item => item.profileId),
      ['child-1']
    );
    assert.deepEqual(
      selectVisibleRedemptionRequests({
        requests,
        profiles,
        selectedProfile: profiles[1],
      }).map(item => item.profileId).sort(),
      ['child-1', 'child-2', 'removed-child']
    );
  });

  it('reconnects a restored stable ID and derives closure status without mutation', () => {
    const removed = profiles.filter(
      profile => profile.id !== 'child-1'
    );
    assert.equal(
      selectVisibleRedemptionRequests({
        requests,
        profiles: removed,
        selectedProfile: removed[0],
      }).some(item => item.profileId === 'child-1'),
      false
    );
    const restored = [...removed, {
      ...profiles[2],
      displayName: 'Renamed child',
    }];
    assert.equal(
      selectVisibleRedemptionRequests({
        requests,
        profiles: restored,
        selectedProfile: restored[0],
      }).some(item => item.profileId === 'child-1'),
      true
    );
    const closed = request('four', 'child-1', {
      kind: 'declined',
      eventKey: 'redemption-request:four:decline',
      actorProfileId: 'adult-1',
      occurredAt: '2026-08-28T11:00:00.000Z',
    });
    assert.equal(getRedemptionRequestStatus(closed), 'declined');
    assert.equal(getRedemptionRequestStatus(requests[0]), 'requested');
  });
});
