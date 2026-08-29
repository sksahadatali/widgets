import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  cancelDemoRedemptionRequest,
  createDemoCatalogueItem,
  createDemoRedemptionRequest,
  declineDemoRedemptionRequest,
  getDemoRedemptionStore,
  resetDemoRedemptionStore,
  updateDemoCatalogueItem,
  validateDemoRedemptionStore,
} from '../../app/src/redemptions/demoRedemptionStore.ts';
import {
  getDemoRewardStore,
} from '../../app/src/rewards/demoRewardStore.ts';

const ITEM = '11111111-1111-4111-8111-111111111111';
const REQUEST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('Demo Redemption store', () => {
  it('contains only safe isolated data and returns a clone', async () => {
    resetDemoRedemptionStore();
    const first = getDemoRedemptionStore();
    const source = await readFile(
      new URL(
        '../../app/src/redemptions/demoRedemptionStore.ts',
        import.meta.url
      ),
      'utf8'
    );
    first.catalogue.length = 0;
    assert.equal(getDemoRedemptionStore().catalogue.length, 2);
    assert.doesNotMatch(
      source,
      /redemptions\.local\.json|rewards\.local\.json|\/api\/|localStorage/
    );
    assert.doesNotMatch(
      JSON.stringify(getDemoRedemptionStore()),
      /@|password|token|secret|address/i
    );
  });

  it('runs request/cancel/decline flows without changing Demo Rewards', () => {
    resetDemoRedemptionStore();
    const rewardBefore = JSON.stringify(
      getDemoRewardStore()
    );
    const input = {
      id: REQUEST,
      catalogueItemId: ITEM,
      profileId: 'child-1',
      requestedByProfileId: 'child-1',
      timeZone: 'Europe/London',
    };
    createDemoRedemptionRequest(input);
    createDemoRedemptionRequest(input);
    assert.equal(getDemoRedemptionStore().requests.length, 1);
    cancelDemoRedemptionRequest(REQUEST, 'child-1');
    cancelDemoRedemptionRequest(REQUEST, 'child-1');
    assert.equal(
      getDemoRedemptionStore().requests[0].closure?.kind,
      'cancelled'
    );

    const second = crypto.randomUUID();
    createDemoRedemptionRequest({ ...input, id: second });
    declineDemoRedemptionRequest(second, 'adult-1');
    assert.equal(
      getDemoRedemptionStore().requests[1].closure?.kind,
      'declined'
    );
    assert.equal(JSON.stringify(getDemoRewardStore()), rewardBefore);
  });

  it('keeps captured details immutable and validates 1–500 stars', () => {
    resetDemoRedemptionStore();
    createDemoRedemptionRequest({
      id: REQUEST,
      catalogueItemId: ITEM,
      profileId: 'child-1',
      requestedByProfileId: 'child-1',
      timeZone: 'Europe/London',
    });
    const captured = structuredClone(
      getDemoRedemptionStore().requests[0].contract
    );
    updateDemoCatalogueItem(ITEM, {
      name: 'Changed safe reward',
      description: null,
      starCost: 500,
    });
    assert.deepEqual(
      getDemoRedemptionStore().requests[0].contract,
      captured
    );
    assert.throws(() => createDemoCatalogueItem({
      id: crypto.randomUUID(),
      name: 'Invalid cost',
      description: null,
      starCost: 501,
    }));
    assert.throws(() => validateDemoRedemptionStore({
      schemaVersion: 1,
      catalogue: [],
      requests: [{ bad: true }],
    }));
  });
});
