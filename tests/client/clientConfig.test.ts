import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bootstrapHouseholdConfig,
  getAppMode,
  validateClientConfig,
} from '../../app/src/services/householdConfigService.ts';

const valid = {
  schemaVersion: 1,
  appMode: 'household',
  household: { displayName: 'Synthetic Household', members: [{ id: 'adult', displayName: 'Adult', memberType: 'adult' }] },
  location: { timezone: 'Europe/London' },
  travel: { leaveBufferMinutes: 10 },
  calendar: { refreshMinutes: 15 },
} as const;

describe('client configuration boundary', () => {
  it('accepts only the exact allowlisted client schema', () => {
    assert.deepEqual(validateClientConfig(valid), valid);
    assert.throws(() => validateClientConfig({ ...valid, homeAddress: 'forbidden' }), /invalid/);
    assert.throws(() => validateClientConfig({ ...valid, location: { ...valid.location, latitude: 51.5 } }), /invalid/);
    assert.throws(() => validateClientConfig({ ...valid, household: { ...valid.household, members: [{ ...valid.household.members[0], calendarId: 'forbidden' }] } }), /invalid/);
  });

  it('does not request Household configuration in Demo', async () => {
    assert.equal(getAppMode(), 'demo');
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error('unexpected'); };
    try { await bootstrapHouseholdConfig(); } finally { globalThis.fetch = originalFetch; }
    assert.equal(calls, 0);
  });
});
