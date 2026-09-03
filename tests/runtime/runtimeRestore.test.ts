import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rename as fsRename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { EXPECTED_RUNTIME_MANIFEST, RUNTIME_STORE_FILES } from '../../server/src/config/runtimeData.js';
import { acquireRuntimeOperationLock, inspectRuntimeOperationLock, releaseRuntimeOperationLock } from '../../server/src/runtime/runtimeOperationLock.js';
import {
  getRestorePaths,
  restoreRuntime,
  RuntimeRestoreCleanupError,
} from '../../server/src/runtime/runtimeRestore.js';
import { getRuntimeRestoreJournalPath, writeRuntimeRestoreJournal } from '../../server/src/runtime/runtimeRestoreJournal.js';
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
import { verifyRuntimeSnapshot } from '../../server/src/runtime/runtimeSnapshotValidation.js';

const temporaryPaths: string[] = [];
const timestamp = '2026-09-03T00:00:00.000Z';
const config = {
  schemaVersion: 1,
  household: { displayName: 'Synthetic Household', members: [{ id: 'adult', displayName: 'Synthetic Adult', memberType: 'adult' }] },
  location: { name: 'Synthetic Place', latitude: 51, longitude: -0.1, timezone: 'Europe/London' },
  travel: { homeAddress: '1 Synthetic Road', leaveBufferMinutes: 10, destinations: [] },
  calendar: { endpoint: 'https://example.invalid/calendar', refreshMinutes: 15, sources: [], semanticRules: [] },
};

function stores(marker: string): Record<string, unknown> {
  return {
    'routines.local.json': { schemaVersion: 3, routines: [], occurrences: [] },
    'rewards.local.json': { schemaVersion: 1, transactions: [] },
    'redemptions.local.json': { schemaVersion: 1, catalogue: [], requests: [] },
    'lists.local.json': { schemaVersion: 1, lists: [{ id: '00000000-0000-4000-8000-000000000001', systemKey: 'shopping', name: `Shopping ${marker}`, active: true, items: [], createdAt: timestamp, updatedAt: timestamp }] },
    'meals.local.json': { schemaVersion: 1, entries: [] },
    'kumon.local.json': { schemaVersion: 1, assignments: [] },
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

afterEach(async () => { await Promise.all(temporaryPaths.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

describe('HS3B whole-runtime restore', () => {
  it('restores exact snapshot bytes, creates safety snapshot, and preserves displaced runtime', async () => {
    const runtimeRoot = await runtimeFixture('A');
    const backupRoot = await temporaryDirectory('eyos-hs3b-backup-');
    const snapshotA = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    await writeFile(join(runtimeRoot, 'data', 'lists.local.json'), `${JSON.stringify(stores('B')['lists.local.json'])}\n`);
    await writeFile(join(runtimeRoot, 'data', 'lists.local.json.bak'), 'old evidence');
    const result = await restoreRuntime({ runtimeRoot, backupRoot, snapshotId: snapshotA.snapshotId, confirmRestore: snapshotA.snapshotId });
    assert.equal(await marker(runtimeRoot), 'Shopping A');
    assert.ok(result.preRestoreSnapshotId);
    assert.match(result.displacedPath!, /\.displaced-/);
    assert.equal(await marker(result.displacedPath!), 'Shopping B');
    assert.equal((await readdir(join(runtimeRoot, 'data'))).includes('lists.local.json.bak'), false);
    assert.equal((await verifyRuntimeSnapshot(join(backupRoot, 'snapshots', result.preRestoreSnapshotId!))).fileCount, 8);
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
    )).fileCount, 8);
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
    assert.equal(evidence.journal?.transition, 'prepare');
    assert.equal(evidence.journal?.transitionState, 'intent');
    assert.equal(evidence.lockOperationId, evidence.journal?.operationId);
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
    assert.equal(evidence.journal?.transition, 'prepare');
    assert.equal(evidence.lockOperationId, null);
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
    assert.equal(evidence.journal?.transition, 'prepare');
    assert.equal(evidence.lockOperationId, null);
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
    assert.equal(evidence.lockOperationId, null);
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
    const result = await recoverRuntimeRestore({ runtimeRoot, backupRoot, action: 'rollback', operationId: state.journal!.operationId, confirmRecover: true });
    assert.equal(result.action, 'rollback');
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
