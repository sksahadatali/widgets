import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, it } from 'node:test';

import { migrateRuntimeLayout1To2 } from '../../server/src/runtime/runtimeLayout2Migration.js';
import { validateProductionRuntime } from '../../server/src/runtime/runtimeRestoreValidation.js';
import { inspectRuntimeOperationLock } from '../../server/src/runtime/runtimeOperationLock.js';

const roots: string[] = [];
const oldStores: Record<string, unknown> = {
  'routines.local.json': { schemaVersion: 3, routines: [], occurrences: [] },
  'rewards.local.json': { schemaVersion: 1, transactions: [] },
  'redemptions.local.json': { schemaVersion: 1, catalogue: [], requests: [] },
  'lists.local.json': { schemaVersion: 1, lists: [{ id: '00000000-0000-4000-8000-000000000001', systemKey: 'shopping', name: 'Shopping', active: true, items: [], createdAt: '2026-09-19T00:00:00.000Z', updatedAt: '2026-09-19T00:00:00.000Z' }] },
  'meals.local.json': { schemaVersion: 1, entries: [] },
  'kumon.local.json': { schemaVersion: 1, assignments: [] },
};
const config = { schemaVersion: 1, household: { displayName: 'Synthetic', members: [{ id: 'adult', displayName: 'Adult', memberType: 'adult' }] }, location: { name: 'Town', latitude: 51, longitude: 0, timezone: 'Europe/London' }, travel: { homeAddress: 'Synthetic', leaveBufferMinutes: 10, destinations: [] }, calendar: { endpoint: 'https://example.invalid/calendar', refreshMinutes: 15, sources: [], semanticRules: [] } };
async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), 'eyos-layout-migration-')); roots.push(parent);
  const source = join(parent, 'Runtime-v1'); const target = join(parent, 'Runtime-v2');
  await mkdir(join(source, 'data'), { recursive: true }); await mkdir(join(source, 'config'));
  await writeFile(join(source, 'runtime.json'), `${JSON.stringify({ schemaVersion: 1, kind: 'eyos-household-runtime', dataLayoutVersion: 1 })}\n`);
  await writeFile(join(source, 'config', 'household.json'), `${JSON.stringify(config)}\n`);
  for (const [file, value] of Object.entries(oldStores)) await writeFile(join(source, 'data', file), `${JSON.stringify(value)}\n`);
  return { source, target };
}
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

describe('runtime layout-1 to layout-2 migration', () => {
  it('publishes a validated copy-only target and leaves source bytes untouched', async () => {
    const { source, target } = await fixture();
    const before = await Promise.all(['runtime.json', 'config/household.json', ...Object.keys(oldStores).map(file => `data/${file}`)].map(path => readFile(join(source, ...path.split('/')))));
    await migrateRuntimeLayout1To2({ sourceRuntimePath: source, targetRuntimePath: target, confirmed: true });
    await validateProductionRuntime(target);
    assert.deepEqual(JSON.parse(await readFile(join(target, 'data', 'calendar-profile-assignments.local.json'), 'utf8')), { schemaVersion: 1, assignments: [] });
    const after = await Promise.all(['runtime.json', 'config/household.json', ...Object.keys(oldStores).map(file => `data/${file}`)].map(path => readFile(join(source, ...path.split('/')))));
    assert.deepEqual(after, before);
    assert.equal(await inspectRuntimeOperationLock(source), null);
  });

  it('requires confirmation and leaves no target after invalid source failure', async () => {
    const { source, target } = await fixture();
    await assert.rejects(() => migrateRuntimeLayout1To2({ sourceRuntimePath: source, targetRuntimePath: target, confirmed: false }), /confirm-layout-2-migration/);
    await writeFile(join(source, 'data', 'rewards.local.json'), '{bad');
    await assert.rejects(() => migrateRuntimeLayout1To2({ sourceRuntimePath: source, targetRuntimePath: target, confirmed: true }));
    await assert.rejects(() => readFile(join(target, 'runtime.json')));
    assert.equal(await inspectRuntimeOperationLock(source), null);
  });
});
