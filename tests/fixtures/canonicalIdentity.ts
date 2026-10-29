import type { HouseholdConfig, HouseholdConfigV1 } from '../../server/src/config/householdConfig.js';
export const TEST_HOUSEHOLD_ID = 'hh_00000000-0000-4000-8000-000000000001';
export const TEST_IDENTITY_TIME = '2026-10-29T00:00:00.000Z';
export function canonicalConfig(legacy: HouseholdConfigV1): HouseholdConfig {
  return { ...legacy, schemaVersion: 2, household: {
    ...legacy.household, householdId: TEST_HOUSEHOLD_ID,
    members: legacy.household.members.map(member => ({ ...member, lifecycle: 'ACTIVE', aliases: [], createdAt: TEST_IDENTITY_TIME, inactiveAt: null })),
  } };
}
export const TEST_ENVELOPE = { schemaVersion: 1, householdId: TEST_HOUSEHOLD_ID, revision: 0, profiles: [], relationships: [], memories: [] };
export const legacyConfig: HouseholdConfigV1 = {
  schemaVersion: 1,
  household: { displayName: 'Synthetic Household', members: [
    { id: 'adult-1', displayName: 'Adult', memberType: 'adult' },
    { id: 'child-1', displayName: 'Child', memberType: 'child' },
  ] },
  location: { name: 'Synthetic Town', latitude: 51, longitude: 0, timezone: 'Europe/London' },
  travel: { homeAddress: 'Synthetic address', leaveBufferMinutes: 10, destinations: [] },
  calendar: { endpoint: 'https://example.invalid/calendar', refreshMinutes: 15, sources: [], semanticRules: [] },
};
