import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';
import { canonicalConfig, legacyConfig, TEST_ENVELOPE } from '../../fixtures/canonicalIdentity.js';
import { getHouseholdConfig, setHouseholdConfigForTests, type HouseholdConfig } from '../../../server/src/config/householdConfig.js';
import { configureRuntimeData, EXPECTED_RUNTIME_MANIFEST, getRuntimeDataConfiguration } from '../../../server/src/config/runtimeData.js';
import { establishHouseholdAccess, withHouseholdAccess, type HouseholdAccessContext } from '../../../server/src/access/householdAccess.js';

const roots: string[] = [];
const time = '2026-10-29T00:00:00.000Z';
export async function testRuntime(config: HouseholdConfig = canonicalConfig(legacyConfig)) {
  const root = await mkdtemp(join(tmpdir(), 'eyos-access-test-')); roots.push(root);
  await mkdir(join(root, 'config')); await mkdir(join(root, 'data'));
  const stores = {
    'routines.local.json': { schemaVersion: 3, routines: [], occurrences: [] },
    'rewards.local.json': { schemaVersion: 1, transactions: [] },
    'redemptions.local.json': { schemaVersion: 1, catalogue: [], requests: [] },
    'lists.local.json': { schemaVersion: 1, lists: [{ id: '00000000-0000-4000-8000-000000000001', systemKey: 'shopping', name: 'Shopping', active: true, items: [], createdAt: time, updatedAt: time }] },
    'meals.local.json': { schemaVersion: 1, entries: [] },
    'kumon.local.json': { schemaVersion: 1, assignments: [] },
    'calendar-profile-assignments.local.json': { schemaVersion: 1, assignments: [] },
    'family-knowledge.local.json': { ...TEST_ENVELOPE, householdId: config.household.householdId },
  };
  await writeFile(join(root, 'runtime.json'), JSON.stringify(EXPECTED_RUNTIME_MANIFEST));
  await writeFile(join(root, 'config', 'household.json'), JSON.stringify(config));
  for (const [file, data] of Object.entries(stores)) await writeFile(join(root, 'data', file), JSON.stringify(data));
  configureRuntimeData({ serverMode: 'development', appMode: 'household', runtimeDirectory: root });
  setHouseholdConfigForTests(config);
  return { root, context: await establishHouseholdAccess(), config };
}
let cached: { config: HouseholdConfig; context: HouseholdAccessContext; runtime: unknown } | undefined;
/** Real external-runtime establishment for existing provider tests, not a bypass capability. */
export async function accessCall<T>(operation: () => T): Promise<Awaited<T>> {
  let config = getHouseholdConfig();
  if (config.schemaVersion !== 2) {
    config = canonicalConfig(config as never);
    setHouseholdConfigForTests(config);
  }
  if (!cached || cached.config !== config || cached.runtime !== getRuntimeDataConfiguration()) {
    const fixture = await testRuntime(config);
    cached = { config, context: fixture.context, runtime: getRuntimeDataConfiguration() };
  }
  return await withHouseholdAccess(cached.context, operation);
}
after(async () => { await Promise.all(roots.map(root => rm(root, { recursive: true, force: true }))); });
