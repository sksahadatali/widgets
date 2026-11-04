import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { canonicalConfig, TEST_ENVELOPE } from '../fixtures/canonicalIdentity.js';
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename as fsRename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, describe, it, mock } from 'node:test';

import { EXPECTED_RUNTIME_MANIFEST, RUNTIME_STORE_FILES } from '../../server/src/config/runtimeData.js';
import { acquireRuntimeOperationLock, inspectRuntimeOperationLock, releaseRuntimeOperationLock } from '../../server/src/runtime/runtimeOperationLock.js';
import {
  getRestorePaths,
  restoreRuntime,
  RuntimeRestoreCleanupError,
} from '../../server/src/runtime/runtimeRestore.js';
import { captureRuntimeRestoreJournal, RuntimeRestoreJournalPublicationError, getRuntimeRestoreJournalPath, writeRuntimeRestoreJournal } from '../../server/src/runtime/runtimeRestoreJournal.js';
import { inspectRuntimeRestore, recoverRuntimeRestore } from '../../server/src/runtime/runtimeRestoreRecovery.js';
import {
  classifyCurrentRuntime,
  validateProductionRuntime,
  validateRestoredRuntime,
} from '../../server/src/runtime/runtimeRestoreValidation.js';
import {
  createRuntimeSnapshot,
  RuntimeSnapshotCleanupError,
} from '../../server/src/runtime/runtimeSnapshot.js';
import { flushDirectory } from '../../server/src/runtime/runtimeDurability.js';
import { verifyRuntimeSnapshot } from '../../server/src/runtime/runtimeSnapshotValidation.js';

const temporaryPaths: string[] = [];
const timestamp = '2026-09-03T00:00:00.000Z';
const config = canonicalConfig({
  schemaVersion: 1,
  household: { displayName: 'Synthetic Household', members: [{ id: 'adult', displayName: 'Synthetic Adult', memberType: 'adult' }] },
  location: { name: 'Synthetic Place', latitude: 51, longitude: -0.1, timezone: 'Europe/London' },
  travel: { homeAddress: '1 Synthetic Road', leaveBufferMinutes: 10, destinations: [] },
  calendar: { endpoint: 'https://example.invalid/calendar', refreshMinutes: 15, sources: [], semanticRules: [] },
});

describe('pre-displacement ownership and lockless compatibility recovery', () => {
  async function stranded() {
    const runtimeRoot = await runtimeFixture('A');
    const backupRoot = await temporaryDirectory('eyos-owned-recovery-');
    const selected = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    await writeFile(join(runtimeRoot, 'data', 'lists.local.json'), JSON.stringify(stores('B')['lists.local.json']));
    const protection = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    const lock = await acquireRuntimeOperationLock({ runtimeRoot, operation: 'restore' });
    const journal = { schemaVersion: 2 as const, operationId: lock.owner.operationId, selectedSnapshotId: selected.snapshotId,
      startedAt: new Date().toISOString(), source: { state: 'valid' as const, protection: { kind: 'snapshot' as const, snapshotId: protection.snapshotId } },
      decision: 'undecided' as const, transition: 'prepare' as const, transitionState: 'intent' as const };
    await writeRuntimeRestoreJournal(runtimeRoot, journal);
    const owned = await writeRuntimeRestoreJournal(runtimeRoot, { ...journal, transition: 'stage' });
    await releaseRuntimeOperationLock(lock);
    const options = { runtimeRoot, backupRoot, operationId: journal.operationId, action: 'abort' as const,
      confirmRecover: true, confirmPreDisplacementAbort: true, expectedJournalSha256: owned.sha256 };
    return { runtimeRoot, backupRoot, selected, protection, journal, owned, options };
  }
  async function bytes(root: string) {
    return Promise.all(['runtime.json', 'config/household.json', ...RUNTIME_STORE_FILES.map(n => `data/${n}`)].map(n => readFile(join(root, n), 'utf8')));
  }

  it('aborts the proven owned stage/intent lockless state, preserving every primary byte', async () => {
    const f = await stranded(), before = await bytes(f.runtimeRoot);
    await assert.rejects(() => recoverRuntimeRestore({ ...f.options, confirmPreDisplacementAbort: false }), /RESTORE_STATE_AMBIGUOUS/);
    assert.equal((await inspectRuntimeRestore(f.runtimeRoot)).lockOperationId, null);
    await recoverRuntimeRestore(f.options);
    assert.deepEqual(await bytes(f.runtimeRoot), before);
    assert.equal(await marker(f.runtimeRoot), 'Shopping B');
    assert.equal((await inspectRuntimeRestore(f.runtimeRoot)).journal, null);
    assert.equal(await inspectRuntimeOperationLock(f.runtimeRoot), null);
  });

  for (const kind of ['hash', 'operation', 'changed-byte', 'runtime', 'staging', 'displaced', 'failed', 'malformed', 'directory', 'other-lock']) {
    it(`rejects ${kind} evidence instead of adopting/repairing lockless state`, async () => {
      const f = await stranded();
      const options = { ...f.options };
      let otherLock;
      const path = getRuntimeRestoreJournalPath(f.runtimeRoot);
      if (kind === 'hash') options.expectedJournalSha256 = '0'.repeat(64);
      if (kind === 'operation') options.operationId = '00000000-0000-4000-8000-000000000099';
      if (kind === 'changed-byte') await writeFile(path, JSON.stringify({ ...f.journal, transition: 'stage', transitionState: 'complete' }));
      if (kind === 'runtime') await writeFile(join(f.runtimeRoot, 'data', 'lists.local.json'), JSON.stringify(stores('C')['lists.local.json']));
      const paths = getRestorePaths(f.runtimeRoot, f.journal.operationId, 'valid');
      if (kind === 'staging') await mkdir(paths.staging);
      if (kind === 'displaced') await mkdir(paths.displaced);
      if (kind === 'failed') await mkdir(join(dirname(f.runtimeRoot), `.${basename(f.runtimeRoot)}.failed-replacement-${f.journal.operationId}`));
      if (kind === 'malformed') await writeFile(path, '{broken');
      if (kind === 'directory') { await rm(path); await mkdir(path); }
      if (kind === 'other-lock') otherLock = await acquireRuntimeOperationLock({ runtimeRoot: f.runtimeRoot, operation: 'server' });
      const before = await bytes(f.runtimeRoot);
      const evidence = kind === 'directory' ? null : await readFile(path, 'utf8');
      await assert.rejects(() => recoverRuntimeRestore(options));
      assert.deepEqual(await bytes(f.runtimeRoot), before);
      if (evidence !== null) assert.equal(await readFile(path, 'utf8'), evidence);
      else assert.equal((await lstat(path)).isDirectory(), true);
      if (otherLock) { assert.equal((await inspectRuntimeOperationLock(f.runtimeRoot))?.owner?.operationId, otherLock.owner.operationId); await releaseRuntimeOperationLock(otherLock); }
      else assert.equal(await inspectRuntimeOperationLock(f.runtimeRoot), null);
    });
  }

  for (const action of ['complete', 'rollback'] as const) it(`never uses pre-displacement confirmation to ${action}`, async () => {
    const f = await stranded(), before = await bytes(f.runtimeRoot);
    await assert.rejects(() => recoverRuntimeRestore({ ...f.options, action }), /RESTORE_STATE_AMBIGUOUS/);
    assert.deepEqual(await bytes(f.runtimeRoot), before);
    await f.owned.assertCurrent();
    assert.equal(await inspectRuntimeOperationLock(f.runtimeRoot), null);
  });

  it('rejects an otherwise valid foreign-identity selected snapshot before acquiring a recovery lock', async () => {
    const f = await stranded();
    const foreign = await runtimeFixture('A');
    const cfgPath = join(foreign, 'config', 'household.json');
    const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
    cfg.household.householdId = 'hh_00000000-0000-4000-8000-000000000099';
    await writeFile(cfgPath, JSON.stringify(cfg));
    const knowledgePath = join(foreign, 'data', 'family-knowledge.local.json');
    const knowledge = JSON.parse(await readFile(knowledgePath, 'utf8'));
    knowledge.householdId = cfg.household.householdId;
    await writeFile(knowledgePath, JSON.stringify(knowledge));
    const selected = await createRuntimeSnapshot({ runtimeRoot: foreign, backupRoot: f.backupRoot });
    const current = (await captureRuntimeRestoreJournal(f.runtimeRoot))!;
    const owned = await writeRuntimeRestoreJournal(f.runtimeRoot, { ...current.journal, selectedSnapshotId: selected.snapshotId }).catch(() => null);
    assert.equal(owned, null, 'a normal journal update cannot switch selected snapshot');
    // Simulate a retained foreign journal, not an application transition.
    await writeFile(getRuntimeRestoreJournalPath(f.runtimeRoot), JSON.stringify({ ...current.journal, selectedSnapshotId: selected.snapshotId }));
    const foreignReceipt = (await captureRuntimeRestoreJournal(f.runtimeRoot))!;
    const before = await bytes(f.runtimeRoot);
    await assert.rejects(() => recoverRuntimeRestore({ ...f.options, expectedJournalSha256: foreignReceipt.sha256 }));
    assert.deepEqual(await bytes(f.runtimeRoot), before);
    await foreignReceipt.assertCurrent();
    assert.equal(await inspectRuntimeOperationLock(f.runtimeRoot), null);
  });

  it('rechecks pinned journal bytes after exclusive recovery-lock acquisition', async () => {
    const f = await stranded();
    const original = fsPromises.mkdir;
    let replaced = false;
    mock.method(fsPromises, 'mkdir', async (path: any, ...args: any[]) => {
      if (String(path).endsWith('.operation-lock') && !replaced) {
        replaced = true;
        await writeFile(getRuntimeRestoreJournalPath(f.runtimeRoot), JSON.stringify({ ...f.journal, transition: 'stage', transitionState: 'complete' }));
      }
      return (original as any)(path, ...args);
    });
    syncBuiltinESMExports();
    await assert.rejects(() => recoverRuntimeRestore(f.options), /RESTORE_JOURNAL_CHANGED/);
    assert.equal(replaced, true);
    assert.equal(await inspectRuntimeOperationLock(f.runtimeRoot), null);
    assert.equal((await inspectRuntimeRestore(f.runtimeRoot)).journal?.transitionState, 'complete');
    assert.equal(await marker(f.runtimeRoot), 'Shopping B');
  });

  it('completes every normal restore phase while Windows observation timestamps vary', async () => {
    const root = await runtimeFixture('A'), backupRoot = await temporaryDirectory('eyos-metadata-restore-');
    const selected = await createRuntimeSnapshot({ runtimeRoot: root, backupRoot });
    await writeFile(join(root, 'data', 'lists.local.json'), JSON.stringify(stores('B')['lists.local.json']));
    const original = fsPromises.lstat;
    let tick = 0n;
    mock.method(fsPromises, 'lstat', async (path: any, options: any) => {
      const stat = await original(path, options); if (!options?.bigint) return stat;
      const delta = ++tick;
      return new Proxy(stat, { get: (s, key) => ['birthtimeNs','mtimeNs','ctimeNs'].includes(String(key)) ? (s[key as keyof typeof s] as bigint) + delta : Reflect.get(s, key) });
    });
    syncBuiltinESMExports();
    await restoreRuntime({ runtimeRoot: root, backupRoot, snapshotId: selected.snapshotId, confirmRestore: selected.snapshotId });
    assert.equal(await marker(root), 'Shopping A');
    assert.equal((await inspectRuntimeRestore(root)).journal, null);
    assert.equal(await inspectRuntimeOperationLock(root), null);
  });

  it('retains ownership after rename succeeded but journal durability failed, then aborts through supported recovery', async () => {
    const runtimeRoot = await runtimeFixture('A'), backupRoot = await temporaryDirectory('eyos-publication-handoff-');
    const selected = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    const original = new Error('synthetic post-publication directory sync failure');
    await assert.rejects(() => restoreRuntime({
      runtimeRoot, backupRoot, snapshotId: selected.snapshotId, confirmRestore: selected.snapshotId,
      journalWriter: (root, journal, _flusher, options) => writeRuntimeRestoreJournal(root, journal, async () => {
        if (journal.transition === 'stage') throw original;
      }, options),
    }), error => {
      assert.ok(error instanceof RuntimeRestoreCleanupError);
      assert.ok(error.operationError instanceof RuntimeRestoreJournalPublicationError);
      assert.equal(error.operationError.operationError, original); return true;
    });
    const state = await inspectRuntimeRestore(runtimeRoot);
    assert.equal(state.journal?.transition, 'stage');
    assert.equal(state.lockOperationId, state.journal?.operationId);
    await recoverRuntimeRestore({ runtimeRoot, backupRoot, operationId: state.journal!.operationId, action: 'abort', confirmRecover: true });
    assert.equal(await marker(runtimeRoot), 'Shopping A');
    assert.equal((await inspectRuntimeRestore(runtimeRoot)).journal, null);
  });
});

function stores(marker: string): Record<string, unknown> {
  return {
    'family-knowledge.local.json': TEST_ENVELOPE,
    'routines.local.json': { schemaVersion: 3, routines: [], occurrences: [] },
    'rewards.local.json': { schemaVersion: 1, transactions: [] },
    'redemptions.local.json': { schemaVersion: 1, catalogue: [], requests: [] },
    'lists.local.json': { schemaVersion: 1, lists: [{ id: '00000000-0000-4000-8000-000000000001', systemKey: 'shopping', name: `Shopping ${marker}`, active: true, items: [], createdAt: timestamp, updatedAt: timestamp }] },
    'meals.local.json': { schemaVersion: 1, entries: [] },
    'kumon.local.json': { schemaVersion: 1, assignments: [] },
    'calendar-profile-assignments.local.json': { schemaVersion: 1, assignments: marker === 'A' ? [] : [{ eventKey: `calendar-event-v1-${'a'.repeat(64)}`, target: { kind: 'family' }, updatedAt: timestamp }] },
  };
}

async function temporaryDirectory(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix)); temporaryPaths.push(path); return path;
}

async function runtimeFixture(marker: string): Promise<string> {
  const root = await temporaryDirectory('eyos-hs3b-runtime-');
  await mkdir(join(root, 'data')); await mkdir(join(root, 'config'));
  await writeFile(join(root, 'runtime.json'), `${JSON.stringify(EXPECTED_RUNTIME_MANIFEST)}\n`);
  await writeFile(join(root, 'config', 'household.json'), `${JSON.stringify(config)}\n`);
  const values = stores(marker);
  await Promise.all(RUNTIME_STORE_FILES.map(file => writeFile(join(root, 'data', file), `${JSON.stringify(values[file])}\n`)));
  return root;
}

async function marker(root: string): Promise<string> {
  const value = JSON.parse(await readFile(join(root, 'data', 'lists.local.json'), 'utf8')) as { lists: Array<{ name: string }> };
  return value.lists[0].name;
}

async function assignmentCount(root: string): Promise<number> {
  const value = JSON.parse(await readFile(join(root, 'data', 'calendar-profile-assignments.local.json'), 'utf8')) as { assignments: unknown[] };
  return value.assignments.length;
}

afterEach(() => { mock.restoreAll(); syncBuiltinESMExports(); });
afterEach(async () => { await Promise.all(temporaryPaths.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

describe('HS3B whole-runtime restore', () => {
  it('classifies only the strict production runtime contract as valid protection', async () => {
    const valid = await runtimeFixture('valid');
    await writeFile(join(valid, 'data', 'lists.local.json.bak'), 'legitimate recovery evidence');
    assert.equal(await classifyCurrentRuntime(valid), 'valid');

    const unknown = await runtimeFixture('unknown');
    await writeFile(join(unknown, 'data', 'unexpected.json'), '{}');
    assert.equal(await classifyCurrentRuntime(unknown), 'invalid');

    const missing = await runtimeFixture('missing');
    await rm(join(missing, 'data', 'meals.local.json'));
    assert.equal(await classifyCurrentRuntime(missing), 'incomplete');

    const malformed = await runtimeFixture('malformed');
    await writeFile(join(malformed, 'data', 'rewards.local.json'), '{bad');
    assert.equal(await classifyCurrentRuntime(malformed), 'invalid');
  });

  it('does not classify linked authoritative data as a valid protected runtime', async () => {
    const root = await runtimeFixture('linked');
    const external = join(await temporaryDirectory('eyos-hs3b-linked-'), 'lists.json');
    await writeFile(external, `${JSON.stringify(stores('external')['lists.local.json'])}\n`);
    await rm(join(root, 'data', 'lists.local.json'));
    await symlink(external, join(root, 'data', 'lists.local.json'));
    assert.equal(await classifyCurrentRuntime(root), 'invalid');
  });
  it('restores exact snapshot bytes, creates safety snapshot, and preserves displaced runtime', async () => {
    const runtimeRoot = await runtimeFixture('A');
    const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshotA = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    await writeFile(join(runtimeRoot, 'data', 'lists.local.json'), `${JSON.stringify(stores('B')['lists.local.json'])}\n`);
    await writeFile(join(runtimeRoot, 'data', 'calendar-profile-assignments.local.json'), `${JSON.stringify(stores('B')['calendar-profile-assignments.local.json'])}\n`);
    await writeFile(join(runtimeRoot, 'data', 'lists.local.json.bak'), 'old evidence');
    const result = await restoreRuntime({ runtimeRoot, backupRoot, snapshotId: snapshotA.snapshotId, confirmRestore: snapshotA.snapshotId });
    assert.equal(await marker(runtimeRoot), 'Shopping A');
    assert.equal(await assignmentCount(runtimeRoot), 0);
    assert.ok(result.preRestoreSnapshotId);
    assert.match(result.displacedPath!, /\.displaced-/);
    assert.equal(await marker(result.displacedPath!), 'Shopping B');
    assert.equal(await assignmentCount(result.displacedPath!), 1);
    assert.equal((await readdir(join(runtimeRoot, 'data'))).includes('lists.local.json.bak'), false);
    assert.equal((await verifyRuntimeSnapshot(join(backupRoot, 'snapshots', result.preRestoreSnapshotId!))).fileCount, 10);
    assert.equal(await inspectRuntimeOperationLock(runtimeRoot), null);
    assert.equal((await inspectRuntimeRestore(runtimeRoot)).journal, null);
  });

  it('uses the shared Windows-hardened publisher for the mandatory safety snapshot', async () => {
    const runtimeRoot = await runtimeFixture('A');
    const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshotA = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    await writeFile(join(runtimeRoot, 'data', 'lists.local.json'), `${JSON.stringify(stores('B')['lists.local.json'])}\n`);
    let publicationAttempts = 0;
    const result = await restoreRuntime({
      runtimeRoot,
      backupRoot,
      snapshotId: snapshotA.snapshotId,
      confirmRestore: snapshotA.snapshotId,
      snapshotCreator: options => createRuntimeSnapshot({
        ...options,
        publicationPlatform: 'win32',
        publicationRenamer: async (source, target) => {
          publicationAttempts += 1;
          if (publicationAttempts === 1) {
            throw Object.assign(new Error('transient sharing failure'), { code: 'EPERM' });
          }
          await fsRename(source, target);
        },
        publicationSleeper: async () => undefined,
      }),
    });
    assert.equal(publicationAttempts, 2);
    assert.equal(await marker(runtimeRoot), 'Shopping A');
    assert.ok(result.preRestoreSnapshotId);
    assert.equal((await verifyRuntimeSnapshot(
      join(backupRoot, 'snapshots', result.preRestoreSnapshotId),
    )).fileCount, 10);
  });

  for (const phase of ['prepare:intent', 'stage:intent', 'displace:complete', 'publish:complete', 'finalize:intent']) {
    it(`retries transient journal publication at ${phase} without replaying restore actions`, async () => {
      const runtimeRoot = await runtimeFixture('A');
      const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
      const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
      await writeFile(join(runtimeRoot, 'data', 'lists.local.json'), `${JSON.stringify(stores('B')['lists.local.json'])}\n`);
      let attempts = 0;
      const phases: string[] = [], faults: string[] = [], waits: number[] = [];
      const result = await restoreRuntime({
        runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId,
        journalWriter: (root, journal) => {
          const current = `${journal.transition}:${journal.transitionState}`;
          phases.push(current);
          return writeRuntimeRestoreJournal(root, journal, flushDirectory, {
            platform: 'win32',
            renamer: async (source, target) => {
              if (current === phase && ++attempts === 1) {
                if (phase === 'prepare:intent') await assert.rejects(() => readFile(target), { code: 'ENOENT' });
                else {
                  const previous = JSON.parse(await readFile(target, 'utf8'));
                  assert.notEqual(`${previous.transition}:${previous.transitionState}`, phase);
                }
                throw Object.assign(new Error('synthetic journal sharing failure'), { code: 'EPERM' });
              }
              await fsRename(source, target);
            },
            sleeper: async delay => { waits.push(delay); },
          });
        },
        faultHook: async point => { faults.push(point); },
      });
      assert.equal(attempts, 2); assert.deepEqual(waits, [25]);
      assert.equal(phases.filter(value => value === phase).length, 1);
      assert.equal(new Set(faults).size, faults.length);
      assert.equal(await marker(runtimeRoot), 'Shopping A');
      assert.equal(await marker(result.displacedPath!), 'Shopping B');
      assert.equal((await inspectRuntimeRestore(runtimeRoot)).journal, null);
      assert.equal(await inspectRuntimeOperationLock(runtimeRoot), null);
      assert.equal((await verifyRuntimeSnapshot(join(backupRoot, 'snapshots', result.preRestoreSnapshotId!))).fileCount, 10);
    });
  }

  it('retains the last durable intent on post-displacement exhaustion and completes through normal recovery', async () => {
    const runtimeRoot = await runtimeFixture('A');
    const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    await writeFile(join(runtimeRoot, 'data', 'lists.local.json'), `${JSON.stringify(stores('B')['lists.local.json'])}\n`);
    const failure = Object.assign(new Error('persistent journal sharing failure'), { code: 'EPERM' });
    let attempts = 0; const waits: number[] = [];
    await assert.rejects(() => restoreRuntime({
      runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId,
      journalWriter: (root, journal) => writeRuntimeRestoreJournal(root, journal, flushDirectory, {
        platform: 'win32',
        renamer: async (source, target) => {
          if (journal.transition === 'displace' && journal.transitionState === 'complete') { attempts++; throw failure; }
          await fsRename(source, target);
        },
        sleeper: async delay => { waits.push(delay); },
      }),
    }), error => error === failure);
    assert.equal(attempts, 8); assert.deepEqual(waits, [25, 50, 100, 200, 400, 800, 1600]);
    const state = await inspectRuntimeRestore(runtimeRoot);
    assert.equal(state.journal?.transition, 'displace'); assert.equal(state.journal?.transitionState, 'intent');
    assert.equal(state.runtimeExists, false); assert.equal(state.displacedExists, true);
    assert.equal(state.lockOperationId, state.journal?.operationId);
    await recoverRuntimeRestore({ runtimeRoot, backupRoot, action: 'complete', operationId: state.journal!.operationId, confirmRecover: true });
    assert.equal(await marker(runtimeRoot), 'Shopping A');
    assert.equal((await inspectRuntimeRestore(runtimeRoot)).journal, null);
    assert.equal(await inspectRuntimeOperationLock(runtimeRoot), null);
  });

  for (const releaseBeforeRecovery of [false, true]) {
    it(`reaches finalisation interruption after a retried journal and recovers with lock ${releaseBeforeRecovery ? 'released' : 'present'}`, async () => {
      const runtimeRoot = await runtimeFixture('A');
      const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
      const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
      await writeFile(join(runtimeRoot, 'data', 'lists.local.json'), `${JSON.stringify(stores('B')['lists.local.json'])}\n`);
      let attempts = 0, finalisations = 0;
      await assert.rejects(() => restoreRuntime({
        runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId,
        journalWriter: (root, journal) => writeRuntimeRestoreJournal(root, journal, flushDirectory, {
          platform: 'win32', renamer: async (source, target) => {
            if (journal.transition === 'finalize' && ++attempts === 1) throw Object.assign(new Error('synthetic finalisation sharing failure'), { code: 'EBUSY' });
            await fsRename(source, target);
          }, sleeper: async () => {},
        }),
        faultHook: async point => { if (point === 'finalizing') { finalisations++; throw new Error('synthetic finalization interruption after retry'); } },
      }), /synthetic finalization interruption after retry/);
      assert.equal(attempts, 2); assert.equal(finalisations, 1);
      const state = await inspectRuntimeRestore(runtimeRoot);
      assert.equal(state.journal?.transition, 'finalize'); assert.equal(state.journal?.outcome, 'restored');
      if (releaseBeforeRecovery) {
        const lock = await inspectRuntimeOperationLock(runtimeRoot); assert.ok(lock?.owner);
        await releaseRuntimeOperationLock({ lockPath: lock.lockPath, owner: lock.owner });
      }
      await recoverRuntimeRestore({ runtimeRoot, backupRoot, action: 'complete', operationId: state.journal!.operationId, confirmRecover: true });
      assert.equal(await marker(runtimeRoot), 'Shopping A');
      assert.equal((await inspectRuntimeRestore(runtimeRoot)).journal, null);
      assert.equal(await inspectRuntimeOperationLock(runtimeRoot), null);
    });
  }

  it('preserves a foreign journal rejected by publication instead of deleting it during pre-destructive cleanup', async () => {
    const runtimeRoot = await runtimeFixture('A');
    const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    await writeFile(join(runtimeRoot, 'data', 'lists.local.json'), `${JSON.stringify(stores('B')['lists.local.json'])}\n`);
    let foreignBytes = '', attempts = 0;
    await assert.rejects(() => restoreRuntime({
      runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId,
      journalWriter: (root, journal) => writeRuntimeRestoreJournal(root, journal, flushDirectory, {
        platform: 'win32',
        renamer: async () => { attempts++; throw Object.assign(new Error('synthetic publication sharing failure'), { code: 'EPERM' }); },
        sleeper: async () => {
          foreignBytes = `${JSON.stringify({ ...journal, operationId: '00000000-0000-4000-8000-000000009999' })}\n`;
          await writeFile(getRuntimeRestoreJournalPath(root), foreignBytes);
        },
      }),
    }), error => {
      assert.ok(error instanceof RuntimeRestoreCleanupError);
      assert.match(String(error.operationError), /RESTORE_JOURNAL_CHANGED/);
      assert.equal(error.cleanupFailures[0]?.step, 'restore-journal');
      return true;
    });
    assert.equal(attempts, 1);
    assert.equal(await marker(runtimeRoot), 'Shopping B');
    const retained = await readFile(getRuntimeRestoreJournalPath(runtimeRoot), 'utf8').catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    });
    assert.equal(retained, foreignBytes, 'foreign transaction evidence must survive rejected publication');
  });

  for (const replacement of ['foreign', 'changed', 'malformed', 'directory', 'missing'] as const) {
    it(`preserves ${replacement} journal evidence during pre-destructive cleanup`, async () => {
      const runtimeRoot = await runtimeFixture('A');
      const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
      const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
      const path = getRuntimeRestoreJournalPath(runtimeRoot);
      const originalError = new Error('synthetic failure before destructive work');
      let retained = '';
      let destructiveReached = false;
      await assert.rejects(() => restoreRuntime({
        runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId,
        faultHook: async point => {
          if (point === 'displacing-current') destructiveReached = true;
          if (point !== 'locked') return;
          const journal = JSON.parse(await readFile(path, 'utf8'));
          if (replacement === 'directory' || replacement === 'missing') {
            await rm(path);
            if (replacement === 'directory') await mkdir(path);
          } else {
            retained = replacement === 'malformed' ? '{invalid' : JSON.stringify({ ...journal,
              ...(replacement === 'foreign' ? { operationId: 'foreign-operation' } : { transitionState: 'complete' }),
            });
            await writeFile(path, retained);
          }
          throw originalError;
        },
      }), error => {
        assert.ok(error instanceof RuntimeRestoreCleanupError);
        assert.equal(error.operationError, originalError);
        assert.equal(error.cleanupFailures[0]?.step, 'restore-journal');
        return true;
      });
      assert.equal(destructiveReached, false);
      assert.equal(await marker(runtimeRoot), 'Shopping A');
      if (replacement === 'directory') assert.equal((await lstat(path)).isDirectory(), true);
      else if (replacement === 'missing') await assert.rejects(() => readFile(path), { code: 'ENOENT' });
      else assert.equal(await readFile(path, 'utf8'), retained);
    });
  }

  it('flushes completed staging and each destructive rename boundary in order', async () => {
    const runtimeRoot = await runtimeFixture('A');
    const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshotA = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    await writeFile(join(runtimeRoot, 'data', 'lists.local.json'), `${JSON.stringify(stores('B')['lists.local.json'])}\n`);
    const events: string[] = [];
    const runtimeParent = dirname(runtimeRoot);
    await restoreRuntime({
      runtimeRoot,
      backupRoot,
      snapshotId: snapshotA.snapshotId,
      confirmRestore: snapshotA.snapshotId,
      runtimeRenamer: async (source, target) => {
        events.push(`rename:${basename(source)}->${basename(target)}`);
        await fsRename(source, target);
      },
      directoryFlusher: async path => {
        events.push(`flush:${path}`);
      },
    });
    const renameIndexes = events
      .map((event, index) => event.startsWith('rename:') ? index : -1)
      .filter(index => index >= 0);
    assert.equal(renameIndexes.length, 2);
    for (const index of renameIndexes) {
      assert.equal(events[index + 1], `flush:${runtimeParent}`);
    }
    assert.ok(events.findIndex(event => event.includes('.restore-staging-') && event.startsWith('flush:')) < renameIndexes[0]);
  });

  it('fails before destructive work when completed staging cannot be durably flushed', async () => {
    const runtimeRoot = await runtimeFixture('A');
    const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshotA = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    await writeFile(join(runtimeRoot, 'data', 'lists.local.json'), `${JSON.stringify(stores('B')['lists.local.json'])}\n`);
    await assert.rejects(() => restoreRuntime({
      runtimeRoot,
      backupRoot,
      snapshotId: snapshotA.snapshotId,
      confirmRestore: snapshotA.snapshotId,
      directoryFlusher: async () => {
        throw Object.assign(new Error('synthetic staging flush failure'), { code: 'EIO' });
      },
    }), /synthetic staging flush failure/);
    assert.equal(await marker(runtimeRoot), 'Shopping B');
    assert.equal(await inspectRuntimeOperationLock(runtimeRoot), null);
    assert.equal((await inspectRuntimeRestore(runtimeRoot)).journal, null);
  });

  it('requires exact confirmation and excludes server ownership without mutation', async () => {
    const runtimeRoot = await runtimeFixture('A'); const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    await assert.rejects(() => restoreRuntime({ runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: 'wrong' }), /RESTORE_CONFIRMATION_REQUIRED/);
    const lock = await acquireRuntimeOperationLock({ runtimeRoot, operation: 'server' });
    await assert.rejects(() => restoreRuntime({ runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId }), /locked by another operation/);
    assert.equal(await marker(runtimeRoot), 'Shopping A'); await releaseRuntimeOperationLock(lock);
  });

  it('verifies the selected snapshot before destructive work', async () => {
    const runtimeRoot = await runtimeFixture('A'); const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    await writeFile(join(snapshot.snapshotPath, 'payload', 'data', 'meals.local.json'), '{}');
    await assert.rejects(() => restoreRuntime({ runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId }), /SNAPSHOT_(SIZE|CHECKSUM)_MISMATCH/);
    assert.equal(await marker(runtimeRoot), 'Shopping A');
  });

  it('blocks before staging when mandatory pre-restore protection fails', async () => {
    const runtimeRoot = await runtimeFixture('A'); const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    await assert.rejects(() => restoreRuntime({
      runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId,
      snapshotCreator: async () => { throw new Error('synthetic protection failure'); },
    }), /synthetic protection failure/);
    assert.equal(await marker(runtimeRoot), 'Shopping A');
    assert.equal(await inspectRuntimeOperationLock(runtimeRoot), null);
    assert.equal((await inspectRuntimeRestore(runtimeRoot)).journal, null);
  });

  it('retains journal evidence when pre-destructive lock release fails', async () => {
    const runtimeRoot = await runtimeFixture('A'); const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    const operationError = new Error('synthetic protection failure');
    const releaseError = new Error('synthetic lock release failure');
    let journalRemovalAttempted = false;
    await assert.rejects(() => restoreRuntime({
      runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId,
      snapshotCreator: async () => { throw operationError; },
      lockReleaser: async () => { throw releaseError; },
      journalRemover: async () => { journalRemovalAttempted = true; },
    }), error => {
      assert.ok(error instanceof RuntimeRestoreCleanupError);
      assert.equal(error.message, 'RESTORE_CLEANUP_FAILED');
      assert.equal(error.operationError, operationError);
      assert.deepEqual(error.cleanupFailures, [{ step: 'operation-lock', error: releaseError }]);
      return true;
    });
    assert.equal(journalRemovalAttempted, false);
    assert.equal(await marker(runtimeRoot), 'Shopping A');
    const evidence = await inspectRuntimeRestore(runtimeRoot);
    assert.equal(evidence.journal?.transition, 'finalize');
    assert.equal(evidence.journal?.outcome, 'aborted');
    assert.equal(evidence.journal?.transitionState, 'intent');
    assert.equal(evidence.lockOperationId, evidence.journal?.operationId);
    await recoverRuntimeRestore({runtimeRoot,backupRoot,action:'abort',operationId:evidence.journal!.operationId,confirmRecover:true});
    assert.equal((await inspectRuntimeRestore(runtimeRoot)).journal,null);
  });

  it('reports journal-removal failure after releasing the lock and retains the journal', async () => {
    const runtimeRoot = await runtimeFixture('A'); const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    const operationError = new Error('synthetic protection failure');
    const journalError = new Error('synthetic journal removal failure');
    await assert.rejects(() => restoreRuntime({
      runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId,
      snapshotCreator: async () => { throw operationError; },
      journalRemover: async () => { throw journalError; },
    }), error => {
      assert.ok(error instanceof RuntimeRestoreCleanupError);
      assert.equal(error.operationError, operationError);
      assert.deepEqual(error.cleanupFailures, [{ step: 'restore-journal', error: journalError }]);
      return true;
    });
    assert.equal(await marker(runtimeRoot), 'Shopping A');
    const evidence = await inspectRuntimeRestore(runtimeRoot);
    assert.equal(evidence.journal?.transition, 'finalize');
    assert.equal(evidence.journal?.outcome, 'aborted');
    assert.equal(evidence.lockOperationId, null);
    await recoverRuntimeRestore({runtimeRoot,backupRoot,action:'abort',operationId:evidence.journal!.operationId,confirmRecover:true});
    assert.equal((await inspectRuntimeRestore(runtimeRoot)).journal,null);
  });

  it('retains journal evidence when restore-staging cleanup cannot be proven', async () => {
    const runtimeRoot = await runtimeFixture('A'); const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    const cleanupError = new Error('synthetic restore staging cleanup failure');
    await assert.rejects(() => restoreRuntime({
      runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId,
      snapshotCreator: async () => { throw new Error('synthetic protection failure'); },
      restoreStagingRemover: async () => { throw cleanupError; },
    }), error => {
      assert.ok(error instanceof RuntimeRestoreCleanupError);
      assert.deepEqual(error.cleanupFailures, [{ step: 'restore-staging', error: cleanupError }]);
      return true;
    });
    assert.equal(await marker(runtimeRoot), 'Shopping A');
    const evidence = await inspectRuntimeRestore(runtimeRoot);
    assert.equal(evidence.journal?.transition, 'abort-cleanup');
    assert.equal(evidence.lockOperationId, evidence.journal?.operationId);
  });

  it('reports mandatory-snapshot cleanup failure and retains restore evidence', async () => {
    const runtimeRoot = await runtimeFixture('A'); const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    const snapshotOperationError = new Error('synthetic mandatory snapshot failure');
    const snapshotCleanupError = new Error('synthetic mandatory snapshot cleanup failure');
    await assert.rejects(() => restoreRuntime({
      runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId,
      snapshotCreator: async () => {
        throw new RuntimeSnapshotCleanupError(
          snapshotOperationError,
          snapshotCleanupError,
          '20260903T010203.456Z-c1ea0a02',
        );
      },
    }), error => {
      assert.ok(error instanceof RuntimeRestoreCleanupError);
      assert.ok(error.operationError instanceof RuntimeSnapshotCleanupError);
      assert.deepEqual(error.cleanupFailures, [{
        step: 'mandatory-snapshot-staging',
        error: snapshotCleanupError,
      }]);
      return true;
    });
    assert.equal(await marker(runtimeRoot), 'Shopping A');
    const evidence = await inspectRuntimeRestore(runtimeRoot);
    assert.equal(evidence.journal?.transition, 'prepare');
    assert.equal(evidence.lockOperationId, evidence.journal?.operationId);
  });

  it('preserves invalid runtime evidence only with explicit confirmation', async () => {
    const source = await runtimeFixture('A'); const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshot = await createRuntimeSnapshot({ runtimeRoot: source, backupRoot });
    const runtimeRoot = await runtimeFixture('broken'); await writeFile(join(runtimeRoot, 'runtime.json'), '{bad');
    await assert.rejects(() => restoreRuntime({ runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId }), /RESTORE_INVALID_RUNTIME_CONFIRMATION_REQUIRED/);
    const result = await restoreRuntime({ runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId, confirmInvalidRuntime: true });
    assert.match(result.displacedPath!, /\.invalid-evidence-/);
    assert.equal(await readFile(join(result.displacedPath!, 'runtime.json'), 'utf8'), '{bad');
  });

  it('continues one provably safe interrupted publication and rejects ambiguity without mutation', async () => {
    const runtimeRoot = await runtimeFixture('A'); const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    await writeFile(join(runtimeRoot, 'data', 'lists.local.json'), `${JSON.stringify(stores('B')['lists.local.json'])}\n`);
    await assert.rejects(() => restoreRuntime({
      runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId,
      faultHook: async phase => { if (phase === 'current-displaced') throw new Error('synthetic interruption'); },
    }), /synthetic interruption/);
    const interrupted = await inspectRuntimeRestore(runtimeRoot);
    assert.equal(interrupted.runtimeExists, false); assert.equal(interrupted.stagingExists, true); assert.equal(interrupted.displacedExists, true);
    const operationId = interrupted.journal!.operationId;
    const recovery = await recoverRuntimeRestore({ runtimeRoot, backupRoot, action: 'complete', operationId, confirmRecover: true });
    assert.equal(recovery.action, 'complete'); assert.equal(await marker(runtimeRoot), 'Shopping A');

    const runtime2 = await runtimeFixture('A');
    await assert.rejects(() => restoreRuntime({
      runtimeRoot: runtime2, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId,
      faultHook: async phase => { if (phase === 'current-displaced') throw new Error('synthetic interruption'); },
    }));
    const state = await inspectRuntimeRestore(runtime2);
    await mkdir(runtime2); // Both runtime and valid staging now exist: deliberately ambiguous.
    const before = await readdir(join(runtime2, '..'));
    await assert.rejects(() => recoverRuntimeRestore({ runtimeRoot: runtime2, backupRoot, action: 'complete', operationId: state.journal!.operationId, confirmRecover: true }), /RESTORE_STATE_AMBIGUOUS/);
    assert.deepEqual(await readdir(join(runtime2, '..')), before);
  });

  it('recovers both atomic rename crash windows from intent using the classified AFTER state', async () => {
    for (const point of ['displaced-before-completion', 'published-before-completion'] as const) {
      const runtimeRoot = await runtimeFixture(`intent-${point}`);
      const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
      const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
      await writeFile(join(runtimeRoot, 'data', 'lists.local.json'), `${JSON.stringify(stores('B')['lists.local.json'])}\n`);
      await assert.rejects(() => restoreRuntime({
        runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId,
        faultHook: async current => { if (current === point) throw new Error(`interrupt ${point}`); },
      }), new RegExp(`interrupt ${point}`));
      const interrupted = await inspectRuntimeRestore(runtimeRoot);
      assert.equal(interrupted.journal?.transitionState, 'intent');
      await recoverRuntimeRestore({ runtimeRoot, backupRoot, action: 'complete', operationId: interrupted.journal!.operationId, confirmRecover: true });
      assert.equal(await marker(runtimeRoot), `Shopping intent-${point}`);
      assert.equal((await inspectRuntimeRestore(runtimeRoot)).journal, null);
    }
  });

  it('keeps restore locks out of the generic stale-lock clearing path', async () => {
    const runtimeRoot = await runtimeFixture('A');
    const lock = await acquireRuntimeOperationLock({ runtimeRoot, operation: 'restore' });
    const { clearRuntimeOperationLock } = await import('../../server/src/runtime/runtimeOperationLock.js');
    await assert.rejects(() => clearRuntimeOperationLock({ runtimeRoot, operationId: lock.owner.operationId, confirmClear: true }), /runtime:restore:recover/);
    await releaseRuntimeOperationLock(lock);
  });

  it('rolls an interrupted replacement back explicitly and preserves the failed replacement', async () => {
    const runtimeRoot = await runtimeFixture('A'); const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    await writeFile(join(runtimeRoot, 'data', 'lists.local.json'), `${JSON.stringify(stores('B')['lists.local.json'])}\n`);
    await writeFile(join(runtimeRoot, 'data', 'lists.local.json.bak'), 'legitimate store backup evidence');
    await assert.rejects(() => restoreRuntime({
      runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId,
      faultHook: async phase => { if (phase === 'replacement-published') throw new Error('synthetic interruption'); },
    }));
    const state = await inspectRuntimeRestore(runtimeRoot);
    const durabilityEvents: string[] = [];
    const result = await recoverRuntimeRestore({
      runtimeRoot,
      backupRoot,
      action: 'rollback',
      operationId: state.journal!.operationId,
      confirmRecover: true,
      runtimeRenamer: async (source, target) => {
        durabilityEvents.push(`rename:${basename(source)}->${basename(target)}`);
        await fsRename(source, target);
      },
      directoryFlusher: async path => {
        durabilityEvents.push(`flush:${path}`);
      },
    });
    assert.equal(result.action, 'rollback');
    const recoveryRenames = durabilityEvents
      .map((event, index) => event.startsWith('rename:') ? index : -1)
      .filter(index => index >= 0);
    assert.equal(recoveryRenames.length, 2);
    recoveryRenames.forEach(index => {
      assert.equal(durabilityEvents[index + 1], `flush:${dirname(runtimeRoot)}`);
    });
    assert.equal(await marker(runtimeRoot), 'Shopping B');
    assert.equal(
      await readFile(join(runtimeRoot, 'data', 'lists.local.json.bak'), 'utf8'),
      'legitimate store backup evidence',
    );
    await validateProductionRuntime(runtimeRoot);
    assert.equal(await classifyCurrentRuntime(runtimeRoot), 'valid');
    const siblings = await readdir(join(runtimeRoot, '..'));
    assert.equal(siblings.some(name => name.includes(`failed-replacement-${state.journal!.operationId}`)), true);
    assert.equal(await inspectRuntimeOperationLock(runtimeRoot), null);
    assert.equal((await inspectRuntimeRestore(runtimeRoot)).journal, null);
  });

  it('rolls back from current-displaced with valid backup evidence and preserves replacement A', async () => {
    const runtimeRoot = await runtimeFixture('A'); const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    await writeFile(join(runtimeRoot, 'data', 'lists.local.json'), `${JSON.stringify(stores('B')['lists.local.json'])}\n`);
    const backupEvidence = `${JSON.stringify(stores('A')['lists.local.json'])}\n`;
    await writeFile(join(runtimeRoot, 'data', 'lists.local.json.bak'), backupEvidence);
    await assert.rejects(() => restoreRuntime({
      runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId,
      faultHook: async phase => { if (phase === 'current-displaced') throw new Error('synthetic interruption'); },
    }));
    const interrupted = await inspectRuntimeRestore(runtimeRoot);
    const operationId = interrupted.journal!.operationId;
    const result = await recoverRuntimeRestore({
      runtimeRoot, backupRoot, action: 'rollback', operationId, confirmRecover: true,
    });
    assert.equal(result.action, 'rollback');
    assert.equal(await marker(runtimeRoot), 'Shopping B');
    assert.equal(await readFile(join(runtimeRoot, 'data', 'lists.local.json.bak'), 'utf8'), backupEvidence);
    const failedPath = join(dirname(runtimeRoot), `.${basename(runtimeRoot)}.failed-replacement-${operationId}`);
    assert.equal(await marker(failedPath), 'Shopping A');
    await validateProductionRuntime(runtimeRoot);
    assert.equal(await classifyCurrentRuntime(runtimeRoot), 'valid');
    assert.equal(await inspectRuntimeOperationLock(runtimeRoot), null);
    assert.equal((await inspectRuntimeRestore(runtimeRoot)).journal, null);
  });

  it('retains recovery journal and lock when a rename-parent flush fails unexpectedly', async () => {
    const runtimeRoot = await runtimeFixture('A');
    const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    await writeFile(join(runtimeRoot, 'data', 'lists.local.json'), `${JSON.stringify(stores('B')['lists.local.json'])}\n`);
    await assert.rejects(() => restoreRuntime({
      runtimeRoot,
      backupRoot,
      snapshotId: snapshot.snapshotId,
      confirmRestore: snapshot.snapshotId,
      faultHook: async phase => {
        if (phase === 'replacement-published') throw new Error('synthetic interruption');
      },
    }));
    const interrupted = await inspectRuntimeRestore(runtimeRoot);
    await assert.rejects(() => recoverRuntimeRestore({
      runtimeRoot,
      backupRoot,
      action: 'rollback',
      operationId: interrupted.journal!.operationId,
      confirmRecover: true,
      directoryFlusher: async () => {
        throw Object.assign(new Error('synthetic recovery flush failure'), { code: 'EIO' });
      },
    }), /synthetic recovery flush failure/);
    const retained = await inspectRuntimeRestore(runtimeRoot);
    assert.equal(retained.journal?.transition, 'rollback-quarantine');
    assert.equal(retained.journal?.transitionState, 'intent');
    assert.equal(retained.lockOperationId, retained.journal?.operationId);
  });

  it('retains recovery evidence when a displaced valid primary is malformed', async () => {
    const runtimeRoot = await runtimeFixture('A'); const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    await writeFile(join(runtimeRoot, 'data', 'lists.local.json'), `${JSON.stringify(stores('B')['lists.local.json'])}\n`);
    await assert.rejects(() => restoreRuntime({
      runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId,
      faultHook: async phase => { if (phase === 'current-displaced') throw new Error('synthetic interruption'); },
    }));
    const interrupted = await inspectRuntimeRestore(runtimeRoot);
    const restorePaths = getRestorePaths(runtimeRoot, interrupted.journal!.operationId, 'valid');
    await writeFile(join(restorePaths.displaced, 'data', 'lists.local.json'), '{malformed');
    await assert.rejects(() => recoverRuntimeRestore({
      runtimeRoot, backupRoot, action: 'rollback', operationId: interrupted.journal!.operationId,
      confirmRecover: true,
    }));
    const retained = await inspectRuntimeRestore(runtimeRoot);
    assert.equal(retained.journal?.transition, 'displace');
    assert.equal(retained.journal?.transitionState, 'complete');
    assert.equal(retained.lockOperationId, retained.journal?.operationId);
    assert.equal(retained.runtimeExists, false);
    assert.equal(retained.stagingExists, true);
    assert.equal(retained.displacedExists, true);
  });

  it('rejects unexpected objects in a displaced valid runtime without mutation', async () => {
    const runtimeRoot = await runtimeFixture('A'); const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    await assert.rejects(() => restoreRuntime({
      runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId,
      faultHook: async phase => { if (phase === 'current-displaced') throw new Error('synthetic interruption'); },
    }));
    const interrupted = await inspectRuntimeRestore(runtimeRoot);
    const restorePaths = getRestorePaths(runtimeRoot, interrupted.journal!.operationId, 'valid');
    await mkdir(join(restorePaths.displaced, 'data', 'unexpected-object'));
    await assert.rejects(() => recoverRuntimeRestore({
      runtimeRoot, backupRoot, action: 'rollback', operationId: interrupted.journal!.operationId,
      confirmRecover: true,
    }), /RESTORE_STATE_AMBIGUOUS/);
    const retained = await inspectRuntimeRestore(runtimeRoot);
    assert.equal(retained.journal?.transition, 'displace');
    assert.equal(retained.lockOperationId, retained.journal?.operationId);
    assert.equal(retained.runtimeExists, false);
  });

  it('rejects an unsafe object even when it uses an allowed store-backup name', async () => {
    const runtimeRoot = await runtimeFixture('A'); const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    await assert.rejects(() => restoreRuntime({
      runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId,
      faultHook: async phase => { if (phase === 'current-displaced') throw new Error('synthetic interruption'); },
    }));
    const interrupted = await inspectRuntimeRestore(runtimeRoot);
    const restorePaths = getRestorePaths(runtimeRoot, interrupted.journal!.operationId, 'valid');
    await mkdir(join(restorePaths.displaced, 'data', 'lists.local.json.bak'));
    await assert.rejects(() => recoverRuntimeRestore({
      runtimeRoot, backupRoot, action: 'rollback', operationId: interrupted.journal!.operationId,
      confirmRecover: true,
    }), /RESTORE_STATE_AMBIGUOUS/);
    const retained = await inspectRuntimeRestore(runtimeRoot);
    assert.equal(retained.journal?.transition, 'displace');
    assert.equal(retained.lockOperationId, retained.journal?.operationId);
    assert.equal(retained.runtimeExists, false);
  });

  it('continues a provable rolling-back state and keeps strict snapshot inventory distinct', async () => {
    const runtimeRoot = await runtimeFixture('A'); const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    await writeFile(join(runtimeRoot, 'data', 'lists.local.json'), `${JSON.stringify(stores('B')['lists.local.json'])}\n`);
    await writeFile(join(runtimeRoot, 'data', 'lists.local.json.bak'), 'legitimate backup evidence');
    await assert.rejects(() => restoreRuntime({
      runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId,
      faultHook: async phase => { if (phase === 'current-displaced') throw new Error('synthetic interruption'); },
    }));
    const interrupted = await inspectRuntimeRestore(runtimeRoot);
    const journal = interrupted.journal!;
    const restorePaths = getRestorePaths(runtimeRoot, journal.operationId, 'valid');
    const failedPath = join(dirname(runtimeRoot), `.${basename(runtimeRoot)}.failed-replacement-${journal.operationId}`);
    await fsRename(restorePaths.staging, failedPath);
    await fsRename(restorePaths.displaced, runtimeRoot);
    await writeRuntimeRestoreJournal(runtimeRoot, {
      ...journal, decision: 'rollback', transition: 'rollback-return', transitionState: 'intent',
    });

    await assert.rejects(() => validateRestoredRuntime(runtimeRoot), /RESTORE_RUNTIME_INVENTORY_INVALID/);
    const result = await recoverRuntimeRestore({
      runtimeRoot, backupRoot, action: 'rollback', operationId: journal.operationId, confirmRecover: true,
    });
    assert.equal(result.action, 'rollback');
    assert.equal(await marker(runtimeRoot), 'Shopping B');
    assert.equal(await marker(failedPath), 'Shopping A');
    assert.equal(await readFile(join(runtimeRoot, 'data', 'lists.local.json.bak'), 'utf8'), 'legitimate backup evidence');
    assert.equal(await inspectRuntimeOperationLock(runtimeRoot), null);
    assert.equal((await inspectRuntimeRestore(runtimeRoot)).journal, null);
  });

  it('idempotently finalizes a committed restore with its lock present or already released', async () => {
    for (const releaseBeforeRecovery of [false, true]) {
      const runtimeRoot = await runtimeFixture(`finalize-${releaseBeforeRecovery}`);
      const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
      const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
      await writeFile(join(runtimeRoot, 'data', 'lists.local.json'), `${JSON.stringify(stores('B')['lists.local.json'])}\n`);
      await assert.rejects(() => restoreRuntime({
        runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId,
        faultHook: async point => { if (point === 'finalizing') throw new Error('synthetic finalization interruption'); },
      }), /synthetic finalization interruption/);
      const state = await inspectRuntimeRestore(runtimeRoot);
      assert.equal(state.journal?.transition, 'finalize');
      assert.equal(state.journal?.outcome, 'restored');
      assert.equal(await marker(runtimeRoot), 'Shopping finalize-' + releaseBeforeRecovery);
      if (releaseBeforeRecovery) {
        const inspected = await inspectRuntimeOperationLock(runtimeRoot);
        assert.ok(inspected?.owner);
        await releaseRuntimeOperationLock({ lockPath: inspected.lockPath, owner: inspected.owner });
      }
      await recoverRuntimeRestore({ runtimeRoot, backupRoot, action: 'complete', operationId: state.journal!.operationId, confirmRecover: true });
      assert.equal((await inspectRuntimeRestore(runtimeRoot)).journal, null);
      assert.equal(await inspectRuntimeOperationLock(runtimeRoot), null);
    }
  });

  it('persists recovery decision durability and rejects a later conflicting action without mutation', async () => {
    const runtimeRoot = await runtimeFixture('A'); const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshot = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    await assert.rejects(() => restoreRuntime({
      runtimeRoot, backupRoot, snapshotId: snapshot.snapshotId, confirmRestore: snapshot.snapshotId,
      faultHook: async point => { if (point === 'current-displaced') throw new Error('stop'); },
    }));
    const state = await inspectRuntimeRestore(runtimeRoot);
    await writeRuntimeRestoreJournal(runtimeRoot, { ...state.journal!, decision: 'rollback' });
    const before = await readdir(dirname(runtimeRoot));
    await assert.rejects(() => recoverRuntimeRestore({ runtimeRoot, backupRoot, action: 'complete', operationId: state.journal!.operationId, confirmRecover: true }), /RESTORE_STATE_AMBIGUOUS/);
    assert.deepEqual(await readdir(dirname(runtimeRoot)), before);
  });

  it('rejects journal v1 rather than inferring compatibility', async () => {
    const runtimeRoot = await runtimeFixture('A');
    await writeFile(getRuntimeRestoreJournalPath(runtimeRoot), `${JSON.stringify({
      schemaVersion: 1, kind: 'eyos-runtime-restore', operationId: 'legacy', snapshotId: 'legacy',
      phase: 'rolling-back', currentState: 'valid', startedAt: timestamp,
    })}\n`);
    await assert.rejects(() => inspectRuntimeRestore(runtimeRoot), /RESTORE_JOURNAL_INVALID/);
  });
});
