import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, it } from 'node:test';

import {
  createClientProjection,
  loadHouseholdConfig,
  setHouseholdConfigForTests,
  validateHouseholdConfig,
  type HouseholdConfig,
} from '../../server/src/config/householdConfig.js';
import { EXPECTED_RUNTIME_MANIFEST, RUNTIME_STORE_FILES } from '../../server/src/config/runtimeData.js';
import { migrateHouseholdConfig } from '../../server/src/runtime/configMigration.js';
import { SHOPPING_LIST_ID } from '../../server/src/services/familyListStore.js';

const temporary: string[] = [];
const timestamp = '2026-09-01T00:00:00.000Z';
const stores: Record<string, unknown> = {
  'routines.local.json': { schemaVersion: 3, routines: [], occurrences: [] },
  'rewards.local.json': { schemaVersion: 1, transactions: [] },
  'redemptions.local.json': { schemaVersion: 1, catalogue: [], requests: [] },
  'lists.local.json': { schemaVersion: 1, lists: [{ id: SHOPPING_LIST_ID, systemKey: 'shopping', name: 'Shopping', active: true, items: [], createdAt: timestamp, updatedAt: timestamp }] },
  'meals.local.json': { schemaVersion: 1, entries: [] },
  'kumon.local.json': { schemaVersion: 1, assignments: [] },
};

function validConfig(): HouseholdConfig {
  return {
    schemaVersion: 1,
    household: { displayName: 'Synthetic Household', members: [{ id: 'adult-1', displayName: 'Synthetic Adult', memberType: 'adult' }] },
    location: { name: 'Synthetic Town', latitude: 51.5, longitude: -0.1, timezone: 'Europe/London' },
    travel: { homeAddress: '10 Synthetic Street', leaveBufferMinutes: 10, destinations: [{ id: 'school', name: 'Synthetic School', aliases: ['School'], travelMinutes: 10 }] },
    calendar: { endpoint: 'https://calendar.example.test/provider', refreshMinutes: 15, sources: [{ sourceId: 'school', label: 'School', kind: 'school', calendarName: 'Private Raw Calendar' }], semanticRules: [{ sourceId: 'school', kind: 'school.holiday', titleEquals: 'Synthetic holiday' }] },
  };
}

async function temp(prefix: string) { const path = await mkdtemp(join(tmpdir(), prefix)); temporary.push(path); return path; }
async function runtimeRoot() {
  const root = await temp('eyos-config-runtime-');
  await mkdir(join(root, 'data'));
  await writeFile(join(root, 'runtime.json'), `${JSON.stringify(EXPECTED_RUNTIME_MANIFEST)}\n`);
  await Promise.all(RUNTIME_STORE_FILES.map(name => writeFile(join(root, 'data', name), `${JSON.stringify(stores[name])}\n`)));
  return root;
}

afterEach(async () => {
  setHouseholdConfigForTests(null, 'demo');
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('external Household configuration', () => {
  it('strictly validates the complete supported schema', () => {
    assert.deepEqual(validateHouseholdConfig(validConfig()), validConfig());
    assert.throws(() => validateHouseholdConfig({ ...validConfig(), unexpected: true }), /unknown field/);
    assert.throws(() => validateHouseholdConfig({ ...validConfig(), schemaVersion: 2 }), /unsupported/);
    assert.throws(() => validateHouseholdConfig({ ...validConfig(), location: { ...validConfig().location, timezone: 'Invalid/Zone' } }), /timezone/);
    assert.throws(() => validateHouseholdConfig({ ...validConfig(), location: { ...validConfig().location, latitude: 91 } }), /latitude/);
    assert.throws(() => validateHouseholdConfig({ ...validConfig(), calendar: { ...validConfig().calendar, endpoint: 'http://calendar.invalid' } }), /HTTPS/);
  });

  it('rejects duplicate member, source and destination IDs and numeric bounds', () => {
    const value = validConfig();
    assert.throws(() => validateHouseholdConfig({ ...value, household: { ...value.household, members: [value.household.members[0], value.household.members[0]] } }), /members\[1\]/);
    assert.throws(() => validateHouseholdConfig({ ...value, calendar: { ...value.calendar, sources: [value.calendar.sources[0], value.calendar.sources[0]] } }), /sources\[1\]/);
    assert.throws(() => validateHouseholdConfig({ ...value, travel: { ...value.travel, destinations: [value.travel.destinations[0], value.travel.destinations[0]] } }), /destinations\[1\]/);
    assert.throws(() => validateHouseholdConfig({ ...value, travel: { ...value.travel, leaveBufferMinutes: 181 } }), /leaveBufferMinutes/);
  });

  it('constructs an exact privacy allowlist', () => {
    const projection = createClientProjection(validConfig());
    assert.deepEqual(projection, {
      schemaVersion: 1, appMode: 'household',
      household: { displayName: 'Synthetic Household', members: [{ id: 'adult-1', displayName: 'Synthetic Adult', memberType: 'adult' }] },
      location: { timezone: 'Europe/London' }, travel: { leaveBufferMinutes: 10 }, calendar: { refreshMinutes: 15 },
    });
    const serialized = JSON.stringify(projection);
    for (const forbidden of ['10 Synthetic Street', '51.5', 'calendar.example.test', 'Private Raw Calendar', 'Synthetic holiday']) assert.doesNotMatch(serialized, new RegExp(forbidden.replace('.', '\\.')));
  });

  it('migrates deterministically without changing source or domain stores', async () => {
    const root = await runtimeRoot();
    const source = join(await temp('eyos-config-source-'), 'household.local.json');
    const { schemaVersion: _version, ...legacy } = validConfig();
    const sourceText = `${JSON.stringify(legacy, null, 2)}\n`;
    await writeFile(source, sourceText);
    const beforeStores = await Promise.all(RUNTIME_STORE_FILES.map(name => readFile(join(root, 'data', name), 'utf8')));
    await migrateHouseholdConfig({ sourcePath: source, runtimeRoot: root });
    assert.equal(await readFile(source, 'utf8'), sourceText);
    assert.deepEqual(validateHouseholdConfig(JSON.parse(await readFile(join(root, 'config', 'household.json'), 'utf8'))), validConfig());
    assert.deepEqual(await Promise.all(RUNTIME_STORE_FILES.map(name => readFile(join(root, 'data', name), 'utf8'))), beforeStores);
    await assert.rejects(() => migrateHouseholdConfig({ sourcePath: source, runtimeRoot: root }), /already exists/);
  });

  it('loads Household external configuration and fails closed', async () => {
    const root = await runtimeRoot();
    await assert.rejects(() => loadHouseholdConfig({ appMode: 'household', rootPath: root, serverMode: 'production' }), /missing/);
    await mkdir(join(root, 'config'));
    await writeFile(join(root, 'config', 'household.json'), `${JSON.stringify(validConfig())}\n`);
    await loadHouseholdConfig({ appMode: 'household', rootPath: root, serverMode: 'production' });
    assert.equal(createClientProjection().household.displayName, 'Synthetic Household');
  });

  it('keeps Demo isolated from external configuration paths', async () => {
    await loadHouseholdConfig({ appMode: 'demo', rootPath: '/path/that/must/not/be-resolved', serverMode: 'production' });
    assert.throws(() => createClientProjection(), /unavailable/);
  });
});
