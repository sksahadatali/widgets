import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { canonicalConfig, legacyConfig, TEST_HOUSEHOLD_ID } from '../fixtures/canonicalIdentity.js';
import { createClientProjection, getHouseholdConfig, listActiveMembers, loadHouseholdConfig, resolveCanonicalMember, setHouseholdConfigForTests, updateMemberIdentityMetadata, validateHouseholdConfig, validateIdentityTransition } from '../../server/src/config/householdConfig.js';
import { configureRuntimeData, getRuntimeStoreOptions, LEGACY_RUNTIME_MANIFEST, LEGACY_RUNTIME_STORE_FILES } from '../../server/src/config/runtimeData.js';
import { emptyFamilyKnowledge, validateFamilyKnowledgeEnvelope } from '../../server/src/identity/familyKnowledgeEnvelope.js';
import { preflightIdentityReferences } from '../../server/src/identity/identityPreflight.js';
import { migrateRuntimeLayout2To3 } from '../../server/src/runtime/runtimeLayout3Migration.js';
import { runtimeSnapshotFiles } from '../../server/src/runtime/runtimeSnapshotInventory.js';
import { createRuntimeSnapshot } from '../../server/src/runtime/runtimeSnapshot.js';
import { verifyRuntimeSnapshot } from '../../server/src/runtime/runtimeSnapshotValidation.js';
import { restoreRuntime } from '../../server/src/runtime/runtimeRestore.js';
import { validateProductionRuntime } from '../../server/src/runtime/runtimeRestoreValidation.js';
import { acquireRuntimeOperationLock, inspectRuntimeOperationLock, releaseRuntimeOperationLock } from '../../server/src/runtime/runtimeOperationLock.js';

const roots: string[] = [];
const time = '2026-10-04T08:00:00.000Z';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
const writeJson = async (file: string, value: unknown) => writeFile(file, JSON.stringify(value, null, 2));
function stores(): Record<string, unknown> {
  return {
    'routines.local.json': { schemaVersion: 3, routines: [], occurrences: [] },
    'rewards.local.json': { schemaVersion: 1, transactions: [] },
    'redemptions.local.json': { schemaVersion: 1, catalogue: [], requests: [] },
    'lists.local.json': { schemaVersion: 1, lists: [{ id: uuid(1), systemKey: 'shopping', name: 'Shopping', active: true, items: [], createdAt: time, updatedAt: time }] },
    'meals.local.json': { schemaVersion: 1, entries: [] },
    'kumon.local.json': { schemaVersion: 1, assignments: [] },
    'calendar-profile-assignments.local.json': { schemaVersion: 1, assignments: [] },
  };
}
async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), 'eyos-identity-')); roots.push(parent);
  const source = join(parent, 'v2'); const target = join(parent, 'v3');
  await mkdir(join(source, 'config'), { recursive: true }); await mkdir(join(source, 'data'));
  await writeJson(join(source, 'runtime.json'), LEGACY_RUNTIME_MANIFEST);
  await writeJson(join(source, 'config', 'household.json'), legacyConfig);
  for (const [file, value] of Object.entries(stores())) await writeJson(join(source, 'data', file), value);
  return { parent, source, target };
}
const migrate = (source: string, target: string) => migrateRuntimeLayout2To3({ sourceRuntimePath: source, targetRuntimePath: target, confirmed: true, confirmNewHousehold: true });
const contents = (root: string, version: 2 | 3 = 2) => Promise.all(runtimeSnapshotFiles(version).map(file => readFile(join(root, file))));
async function legacySnapshot(source: string, parent: string) {
  const id = '20261004T080000.000Z-aaaaaaaa';
  const snapshotPath = join(parent, 'backup', 'snapshots', id);
  await mkdir(join(snapshotPath, 'payload', 'config'), { recursive: true }); await mkdir(join(snapshotPath, 'payload', 'data'));
  const files = [];
  for (const file of runtimeSnapshotFiles(2)) {
    const bytes = await readFile(join(source, file));
    await copyFile(join(source, file), join(snapshotPath, 'payload', file));
    files.push({ path: file, bytes: bytes.length, sha256: digest(bytes) });
  }
  await writeJson(join(snapshotPath, 'snapshot.json'), {
    schemaVersion: 1, kind: 'eyos-runtime-snapshot', snapshotId: id, createdAt: time,
    source: { runtimeManifest: LEGACY_RUNTIME_MANIFEST, householdConfigSchemaVersion: 1 },
    consistency: { mode: 'offline', operationLockHeld: true }, files,
  });
  return { snapshotPath, id, backup: join(parent, 'backup') };
}
afterEach(async () => {
  setHouseholdConfigForTests(null, 'demo');
  configureRuntimeData({ serverMode: 'development', appMode: 'household' });
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('AI-1A canonical identity contract', () => {
  it('preserves ID and creation time across rename, aliases, child to adult, inactivity and reactivation', () => {
    const before = canonicalConfig(legacyConfig);
    let after = updateMemberIdentityMetadata(before, 'child-1', { displayName: 'New name', aliases: ['Nickname'], memberType: 'adult' });
    assert.equal(after.household.members[1].id, 'child-1');
    assert.equal(after.household.members[1].createdAt, before.household.members[1].createdAt);
    const inactiveAt = new Date('2026-10-30T10:00:00.000Z');
    after = updateMemberIdentityMetadata(after, 'child-1', { lifecycle: 'INACTIVE' }, inactiveAt);
    assert.equal(resolveCanonicalMember('child-1', after)?.inactiveAt, inactiveAt.toISOString());
    assert.equal(resolveCanonicalMember('child-1', after)?.displayName, 'New name');
    assert.deepEqual(listActiveMembers(after).map(member => member.id), ['adult-1']);
    for (const id of ['Nickname', 'New name', 'missing', 'family']) assert.equal(resolveCanonicalMember(id, after), null);
    after = updateMemberIdentityMetadata(after, 'child-1', { aliases: ['Changed'] });
    assert.equal(resolveCanonicalMember('child-1', after)?.inactiveAt, inactiveAt.toISOString());
    after = updateMemberIdentityMetadata(after, 'child-1', { lifecycle: 'ACTIVE' });
    assert.equal(resolveCanonicalMember('child-1', after)?.inactiveAt, null);
  });
  it('rejects changing/deleting established IDs and fabricated timestamp edits', () => {
    const before = canonicalConfig(legacyConfig);
    for (const patch of [{ id: 'new' }, { memberId: 'new' }, { householdId: `hh_${uuid(2)}` }, { createdAt: time }, { inactiveAt: time }]) assert.throws(() => updateMemberIdentityMetadata(before, 'child-1', patch));
    const changed = structuredClone(before); changed.household.members.pop();
    assert.throws(() => validateIdentityTransition(before, changed), /immutable/);
    assert.throws(() => validateIdentityTransition(before, { ...before, household: { ...before.household, householdId: `hh_${uuid(2)}` } }), /immutable/);
    const badTime = structuredClone(before); badTime.household.members[0].createdAt = time;
    assert.throws(() => validateIdentityTransition(before, badTime), /immutable/);
  });
  it('validates metadata strictly and never treats family as a canonical member', () => {
    const config = canonicalConfig(legacyConfig);
    for (const patch of [{ id: 'family' }, { id: ' adult-1' }, { lifecycle: 'deleted' }, { aliases: ['A', 'a'] }, { createdAt: 'yesterday' }, { inactiveAt: time }, { lifecycle: 'INACTIVE', inactiveAt: null }]) {
      const bad = structuredClone(config); Object.assign(bad.household.members[0], patch);
      assert.throws(() => validateHouseholdConfig(bad));
    }
    assert.throws(() => validateHouseholdConfig(legacyConfig), /migration/);
    assert.equal('memberId' in config.household.members[0], false);
  });
  it('rejects nonempty knowledge, wrong revisions and foreign household scope without repair', async () => {
    const { source, target } = await fixture(); await migrate(source, target);
    const file = join(target, 'data', 'family-knowledge.local.json'); const envelope = await json(file);
    for (const extra of [{ profiles: [{}] }, { relationships: [{ type: 'MEMBER_OF_HOUSEHOLD' }] }, { memories: [{}] }, { revision: 1 }, { extra: true }]) assert.throws(() => validateFamilyKnowledgeEnvelope({ ...envelope, ...extra }));
    await writeJson(file, { ...envelope, householdId: `hh_${uuid(99)}` }); const bytes = await readFile(file);
    await assert.rejects(() => validateProductionRuntime(target), /HOUSEHOLD_SCOPE_MISMATCH/);
    assert.deepEqual(await readFile(file), bytes);
  });
  it('retains the identity guard after a rejected configuration reload', async () => {
    const { source, target } = await fixture(); await migrate(source, target);
    const options = { rootPath: target, appMode: 'household' as const, serverMode: 'production' as const };
    await loadHouseholdConfig(options);
    const original = getHouseholdConfig().household.householdId;
    const file = join(target, 'config', 'household.json'); const changed = await json(file);
    changed.household.householdId = TEST_HOUSEHOLD_ID;
    await writeJson(file, changed);
    await assert.rejects(() => loadHouseholdConfig(options), /invalid/);
    await assert.rejects(() => loadHouseholdConfig(options), /invalid/);
    assert.equal(getHouseholdConfig().household.householdId, original);
  });
  it('keeps Demo from loading identity or accessing the envelope', async () => {
    setHouseholdConfigForTests(canonicalConfig(legacyConfig));
    await loadHouseholdConfig({ appMode: 'demo', rootPath: '/must/not/be/read', serverMode: 'production' });
    assert.throws(() => getHouseholdConfig(), /unavailable/);
    assert.throws(() => resolveCanonicalMember('child-1'), /unavailable/);
    assert.throws(() => createClientProjection(), /unavailable/);
    configureRuntimeData({ appMode: 'demo', serverMode: 'production', runtimeDirectory: '/must/not/be/read' });
    assert.equal(getRuntimeStoreOptions('family-knowledge.local.json').policy, 'disabled');
  });
});

describe('AI-1A offline identity migration', () => {
  it('migrates config/layout once, preserves operational bytes and survives reload/retry', async () => {
    const { source, target } = await fixture(); const before = await contents(source); const started = Date.now();
    const result = await migrate(source, target);
    assert.match(result.householdId, /^hh_[0-9a-f-]{36}$/); assert.deepEqual(await contents(source), before);
    await validateProductionRuntime(target);
    const config = await json(join(target, 'config', 'household.json'));
    assert.equal(config.schemaVersion, 2); assert.equal((await json(join(target, 'runtime.json'))).dataLayoutVersion, 3);
    assert.deepEqual(config.household.members.map((member: { id: string }) => member.id), ['adult-1', 'child-1']);
    for (const member of config.household.members) {
      assert.equal(member.lifecycle, 'ACTIVE'); assert.equal(member.inactiveAt, null); assert.deepEqual(member.aliases, []);
      assert.ok(Date.parse(member.createdAt) >= started);
    }
    assert.deepEqual(await json(join(target, 'data', 'family-knowledge.local.json')), emptyFamilyKnowledge(result.householdId));
    for (const file of LEGACY_RUNTIME_STORE_FILES) assert.deepEqual(await readFile(join(source, 'data', file)), await readFile(join(target, 'data', file)));
    const targetBytes = await contents(target, 3);
    assert.equal((await migrate(source, target)).householdId, result.householdId); assert.deepEqual(await contents(target, 3), targetBytes);
    for (let i = 0; i < 2; i++) {
      setHouseholdConfigForTests(null, 'demo');
      await loadHouseholdConfig({ rootPath: target, appMode: 'household', serverMode: 'production' });
      assert.equal(getHouseholdConfig().household.householdId, result.householdId);
      assert.throws(() => Object.assign(getHouseholdConfig().household.members[0], { id: 'replacement' }));
      assert.throws(() => getHouseholdConfig().household.members.pop());
      assert.throws(() => Object.assign(getHouseholdConfig(), { household: canonicalConfig(legacyConfig).household }));
    }
  });
  for (const point of ['journaled', 'copied', 'validated', 'published'] as const) {
    it(`recovers interruption at ${point} with the same ID and untouched source`, async () => {
      const { parent, source, target } = await fixture(); const before = await contents(source);
      await assert.rejects(() => migrateRuntimeLayout2To3({ sourceRuntimePath: source, targetRuntimePath: target, confirmed: true, confirmNewHousehold: true,
        faultHook: stage => { if (stage === point) throw new Error('injected'); } }), /injected/);
      const journal = await json(join(parent, '.v3.identity-migration.json'));
      assert.deepEqual(await contents(source), before);
      assert.equal(await inspectRuntimeOperationLock(source), null); assert.equal(await inspectRuntimeOperationLock(target), null);
      assert.equal((await migrate(source, target)).householdId, journal.householdId);
      assert.equal((await json(join(target, 'config', 'household.json'))).household.members[0].createdAt, journal.establishedAt);
    });
  }

  it('preflights every significant reference and preserves unresolved IDs without name matching', async () => {
    const { source, target } = await fixture(); const values = stores() as Record<string, any>;
    const schedule = { daysOfWeek: [7], startTime: null, endTime: null };
    const reward = { recipientProfileId: 'orphan-recipient', currency: 'star', amount: 1 };
    values['routines.local.json'] = { schemaVersion: 3,
      routines: [{ id: 'routine-1', title: 'Child', ownerProfileId: 'Child', active: true, schedule, steps: [], reward, createdAt: time, updatedAt: time }],
      occurrences: [{ id: 'routine-1@2026-10-04', routineId: 'routine-1', localDate: '2026-10-04', timeZone: 'Europe/London',
        snapshot: { title: 'Historic', ownerProfileId: 'orphan-owner', schedule, steps: [], definitionUpdatedAt: time, capturedAt: time, source: 'captured' },
        rewardContract: reward, completionSequence: 0, completedSteps: {}, completedAt: null, updatedAt: time }],
    };
    values['rewards.local.json'].transactions.push({ id: 'award-1', profileId: 'orphan-recipient', entryType: 'award', currency: 'star', amount: 1, category: 'other', reason: null,
      source: { kind: 'manual-parent-award', eventKey: 'manual:1' }, relation: null, actorProfileId: 'orphan-actor', createdAt: time, localDate: '2026-10-04', timeZone: 'Europe/London' });
    values['redemptions.local.json'].catalogue.push({ id: uuid(4), name: 'Historic', description: null, starCost: 1, active: false, createdAt: time, updatedAt: time });
    values['redemptions.local.json'].requests.push({ id: uuid(3), eventKey: `redemption-request:${uuid(3)}`, profileId: 'orphan-requester', requestedByProfileId: 'orphan-requester',
      contract: { catalogueItemId: uuid(4), name: 'Historic', description: null, currency: 'star', starCost: 1 }, requestedAt: time, localDate: '2026-10-04', timeZone: 'Europe/London',
      closure: { kind: 'declined', eventKey: `redemption-request:${uuid(3)}:decline`, actorProfileId: 'orphan-closer', occurredAt: time } });
    values['lists.local.json'].lists[0].items.push({ id: uuid(2), title: 'Item', addedByProfileId: 'orphan-list', createdAt: time, updatedAt: time, checkedAt: null });
    values['kumon.local.json'].assignments.push({ id: uuid(5), localDate: '2026-10-04', childProfileId: 'orphan-kumon', subject: 'maths', assignmentLabel: 'Historic', totalUnits: 1, completedUnits: 0, completedAt: null, createdAt: time, updatedAt: time });
    values['calendar-profile-assignments.local.json'].assignments.push({ eventKey: `calendar-event-v1-${'a'.repeat(64)}`, target: { kind: 'members', profileIds: ['orphan-calendar'] }, updatedAt: time });
    const config = structuredClone(legacyConfig);
    config.calendar.sources.push({ sourceId: 'personal', label: 'Personal', kind: 'personal', calendarName: 'Synthetic', defaultProfileAssignment: { kind: 'members', profileIds: ['orphan-default'] } });
    await writeJson(join(source, 'config', 'household.json'), config);
    for (const [file, value] of Object.entries(values)) await writeJson(join(source, 'data', file), value);
    await validateProductionRuntime(source, 2);
    const before = await contents(source);
    const report = await preflightIdentityReferences(source);
    assert.equal(report.canMigrate, true);
    const unresolved = report.findings.filter(finding => finding.code === 'UNRESOLVED');
    assert.equal(unresolved.length, 13);
    assert.ok(unresolved.every(finding => finding.severity === 'WARNING'));
    for (const field of ['ownerProfileId', 'recipientProfileId', 'profileId', 'actorProfileId', 'requestedByProfileId', 'addedByProfileId', 'childProfileId', 'profileIds']) assert.ok(unresolved.some(finding => finding.location.includes(field)), field);
    assert.ok(unresolved.some(finding => finding.location.includes('snapshot')));
    assert.ok(unresolved.some(finding => finding.location.includes('rewardContract')));
    assert.ok(unresolved.some(finding => finding.memberId === 'Child')); // a current display name, never an ID match
    assert.deepEqual(await contents(source), before);
    await migrate(source, target);
    for (const file of LEGACY_RUNTIME_STORE_FILES) assert.deepEqual(await readFile(join(source, 'data', file)), await readFile(join(target, 'data', file)));
    assert.equal((await json(join(target, 'config', 'household.json'))).calendar.sources[0].defaultProfileAssignment.profileIds[0], 'orphan-default');
  });
  it('blocks duplicate/sentinel IDs, invalid stores and unsafe files before journaling', async () => {
    for (const bad of ['duplicate', 'sentinel', 'store', 'symlink']) {
      const { parent, source, target } = await fixture();
      if (bad === 'duplicate' || bad === 'sentinel') {
        const config = structuredClone(legacyConfig); Object.assign(config.household.members[1], { id: bad === 'duplicate' ? 'adult-1' : 'family' });
        await writeJson(join(source, 'config', 'household.json'), config);
      } else if (bad === 'store') await writeFile(join(source, 'data', 'rewards.local.json'), '{bad');
      else { const path = join(source, 'data', 'meals.local.json'); await rm(path); await symlink(join(source, 'data', 'rewards.local.json'), path); }
      const report = await preflightIdentityReferences(source);
      assert.equal(report.canMigrate, false); assert.equal(report.findings[0].severity, 'BLOCKER');
      await assert.rejects(() => migrate(source, target), /PREFLIGHT/);
      assert.equal((await readdir(parent)).some(file => file.includes('identity')), false);
    }
  });
  it('requires explicit identity establishment, excludes server ownership and rejects overlapping paths', async () => {
    const { source, target } = await fixture();
    await assert.rejects(() => migrateRuntimeLayout2To3({ sourceRuntimePath: source, targetRuntimePath: target, confirmed: true }), /ANCHOR_REQUIRED/);
    const lock = await acquireRuntimeOperationLock({ runtimeRoot: source, operation: 'server' });
    try { await assert.rejects(() => migrate(source, target), /locked/); } finally { await releaseRuntimeOperationLock(lock); }
    await assert.rejects(() => migrate(source, join(source, 'nested')), /OVERLAP/);
  });
  it('fails closed for changed source or damaged journal instead of minting another ID', async () => {
    const { parent, source, target } = await fixture();
    await assert.rejects(() => migrateRuntimeLayout2To3({ sourceRuntimePath: source, targetRuntimePath: target, confirmed: true, confirmNewHousehold: true, faultHook: () => { throw new Error('stop'); } }));
    const journalFile = join(parent, '.v3.identity-migration.json'); const before = await readFile(journalFile);
    await writeFile(join(source, 'data', 'meals.local.json'), '{"schemaVersion":1,"entries":[]}\n');
    await assert.rejects(() => migrate(source, target), /JOURNAL_MISMATCH/); assert.deepEqual(await readFile(journalFile), before);
    await writeFile(journalFile, '{partial'); await assert.rejects(() => migrate(source, target));
    assert.equal(await readFile(journalFile, 'utf8'), '{partial');
  });
});

describe('AI-1A snapshot compatibility', () => {
  it('native v3 snapshot/restore preserves canonical identity and the envelope', async () => {
    const { parent, source, target } = await fixture(); const result = await migrate(source, target);
    const backup = join(parent, 'backup'); await mkdir(backup);
    const snapshot = await createRuntimeSnapshot({ runtimeRoot: target, backupRoot: backup });
    assert.equal((await verifyRuntimeSnapshot(snapshot.snapshotPath)).fileCount, 10); const bytes = await contents(target, 3);
    await restoreRuntime({ runtimeRoot: target, backupRoot: backup, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId });
    assert.deepEqual(await contents(target, 3), bytes);
    assert.equal((await json(join(target, 'config', 'household.json'))).household.householdId, result.householdId);
  });
  it('verifies untouched v2 snapshots, rejects direct activation, explicitly migrates using established identity', async () => {
    const { parent, source, target } = await fixture(); const result = await migrate(source, target);
    const { snapshotPath, id, backup } = await legacySnapshot(source, parent);
    const manifestBytes = await readFile(join(snapshotPath, 'snapshot.json')); const payloadBytes = await contents(join(snapshotPath, 'payload'));
    await assert.rejects(() => migrate(join(snapshotPath, 'payload'), join(parent, 'unsafe-snapshot-source')), /USE_SNAPSHOT_OPTION/);
    assert.equal((await verifyRuntimeSnapshot(snapshotPath)).dataLayoutVersion, 2); assert.equal((await verifyRuntimeSnapshot(snapshotPath)).fileCount, 9);
    await assert.rejects(() => restoreRuntime({ runtimeRoot: target, backupRoot: backup, snapshotId: id, confirmRestore: id }), /LEGACY_REQUIRES_IDENTITY_MIGRATION/);
    await assert.rejects(() => migrateRuntimeLayout2To3({ sourceSnapshotPath: snapshotPath, targetRuntimePath: join(parent, 'legacy-restored'), confirmed: true, confirmNewHousehold: true }), /ANCHOR_REQUIRED/);
    const restored = await migrateRuntimeLayout2To3({ sourceSnapshotPath: snapshotPath, targetRuntimePath: join(parent, 'legacy-restored'), identityFromRuntimePath: target, confirmed: true });
    assert.equal(restored.householdId, result.householdId); assert.deepEqual(await readFile(join(snapshotPath, 'snapshot.json')), manifestBytes);
    assert.deepEqual(await contents(join(snapshotPath, 'payload')), payloadBytes);
    assert.deepEqual((await json(join(parent, 'legacy-restored', 'config', 'household.json'))).household, (await json(join(target, 'config', 'household.json'))).household);
  });
  it('rejects a foreign-household restore or dropping established members', async () => {
    const { parent, source, target } = await fixture(); await migrate(source, target);
    const backup = join(parent, 'backup'); await mkdir(backup); const snapshot = await createRuntimeSnapshot({ runtimeRoot: target, backupRoot: backup });
    const file = join(target, 'config', 'household.json'); const current = await json(file);
    current.household.members.push({ ...current.household.members[0], id: 'adult-new' }); await writeJson(file, current);
    await assert.rejects(() => restoreRuntime({ runtimeRoot: target, backupRoot: backup, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId }), /IDENTITY_INCOMPATIBLE/);
    await rm(file);
    await assert.rejects(() => restoreRuntime({ runtimeRoot: target, backupRoot: backup, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId, confirmInvalidRuntime: true }), /IDENTITY_INCOMPATIBLE/);
    current.household.members.pop(); current.household.householdId = TEST_HOUSEHOLD_ID; await writeJson(file, current);
    await writeJson(join(target, 'data', 'family-knowledge.local.json'), emptyFamilyKnowledge(TEST_HOUSEHOLD_ID));
    await assert.rejects(() => restoreRuntime({ runtimeRoot: target, backupRoot: backup, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId }), /IDENTITY_INCOMPATIBLE/);
  });
});
