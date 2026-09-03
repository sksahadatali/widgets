import { copyFile, lstat, mkdir, realpath, rename, rm, statfs } from 'node:fs/promises';
import { constants } from 'node:fs';

import { assertExternalPath, assertExternalRuntimePath, getAbsolutePathStyle, isPathWithin } from '../config/runtimeData.js';
import { acquireRuntimeOperationLock, releaseRuntimeOperationLock } from './runtimeOperationLock.js';
import {
  createRuntimeSnapshot,
  flushCopiedFile,
  RuntimeSnapshotCleanupError,
} from './runtimeSnapshot.js';
import { appendSnapshotAudit } from './runtimeSnapshotAudit.js';
import { RUNTIME_SNAPSHOT_FILES } from './runtimeSnapshotInventory.js';
import { SNAPSHOT_ID_PATTERN } from './runtimeSnapshotManifest.js';
import { verifyRuntimeSnapshot } from './runtimeSnapshotValidation.js';
import {
  getRuntimeRestoreJournalPath, readRuntimeRestoreJournal, removeRuntimeRestoreJournal,
  writeRuntimeRestoreJournal, type CurrentRuntimeState, type RestoreTransition, type RuntimeRestoreJournal,
} from './runtimeRestoreJournal.js';
import { classifyCurrentRuntime, estimateRuntimeBytes, runtimeMatchesSnapshot, validateRestoredRuntime } from './runtimeRestoreValidation.js';

export type RestoreResult = {
  operationId: string;
  snapshotId: string;
  sourceState: CurrentRuntimeState;
  preRestoreSnapshotId?: string;
  displacedPath?: string;
  audit: 'recorded' | 'degraded';
};

export type RestoreFaultPoint =
  | 'locked' | 'protected' | 'staging' | 'staged' | 'displacing-current'
  | 'displaced-before-completion' | 'current-displaced' | 'publishing-replacement'
  | 'published-before-completion' | 'replacement-published'
  | 'verifying-restored' | 'restored-verified' | 'finalizing';
export type RestoreFaultHook = (point: RestoreFaultPoint) => Promise<void>;

export type RestoreCleanupStep =
  | 'mandatory-snapshot-staging'
  | 'restore-staging'
  | 'operation-lock'
  | 'restore-journal';

export class RuntimeRestoreCleanupError extends Error {
  readonly code = 'RESTORE_CLEANUP_FAILED';

  constructor(
    readonly operationError: unknown,
    readonly cleanupFailures: ReadonlyArray<{
      step: RestoreCleanupStep;
      error: unknown;
    }>,
  ) {
    super('RESTORE_CLEANUP_FAILED', { cause: cleanupFailures[0]?.error });
    this.name = 'RuntimeRestoreCleanupError';
  }
}

function paths(runtimeRoot: string, operationId: string, state: CurrentRuntimeState) {
  const style = getAbsolutePathStyle(runtimeRoot)!;
  const parent = style.dirname(runtimeRoot);
  const name = style.basename(runtimeRoot);
  return {
    staging: style.join(parent, `.${name}.restore-staging-${operationId}`),
    displaced: state === 'valid'
      ? style.join(parent, `.${name}.displaced-${operationId}`)
      : style.join(parent, `.${name}.invalid-evidence-${operationId}`),
  };
}

async function pathExists(path: string): Promise<boolean> {
  return Boolean(await lstat(path).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }));
}

async function assertRestorePaths(runtimeRootValue: string, backupRootValue: string, snapshotId: string) {
  const runtimeRoot = assertExternalRuntimePath(runtimeRootValue);
  const backupRoot = assertExternalPath(backupRootValue, 'Backup root');
  const style = getAbsolutePathStyle(runtimeRoot)!;
  if (style !== getAbsolutePathStyle(backupRoot)) throw new Error('RESTORE_PATH_STYLE_MISMATCH');
  if (!SNAPSHOT_ID_PATTERN.test(snapshotId)) throw new Error('RESTORE_SNAPSHOT_ID_INVALID');
  const parentReal = await realpath(style.dirname(runtimeRoot));
  assertExternalRuntimePath(parentReal);
  const backupReal = await realpath(backupRoot).catch(() => { throw new Error('RESTORE_BACKUP_ROOT_MISSING'); });
  const backupStats = await lstat(backupRoot);
  if (!backupStats.isDirectory() || backupStats.isSymbolicLink()) throw new Error('RESTORE_BACKUP_ROOT_UNSAFE');
  if (isPathWithin(runtimeRoot, backupReal) || isPathWithin(backupReal, runtimeRoot)) throw new Error('RESTORE_PATH_CONTAINMENT');
  const snapshotPath = style.join(backupRoot, 'snapshots', snapshotId);
  if (!isPathWithin(backupRoot, snapshotPath)) throw new Error('RESTORE_SNAPSHOT_PATH_UNSAFE');
  return { runtimeRoot, backupRoot, snapshotPath, style };
}

async function bestEffortSpaceCheck(parent: string, requiredBytes: number): Promise<void> {
  try {
    const value = await statfs(parent);
    if (Number(value.bavail) * Number(value.bsize) < requiredBytes) throw new Error('RESTORE_SPACE_INSUFFICIENT');
  } catch (error) {
    if (error instanceof Error && error.message === 'RESTORE_SPACE_INSUFFICIENT') throw error;
    // Unsupported/unavailable capacity reporting is not a correctness boundary.
  }
}

async function stageSnapshot(snapshotPath: string, staging: string): Promise<void> {
  const style = getAbsolutePathStyle(staging)!;
  await mkdir(staging, { mode: 0o700 });
  await mkdir(style.join(staging, 'config'), { mode: 0o700 });
  await mkdir(style.join(staging, 'data'), { mode: 0o700 });
  for (const relative of RUNTIME_SNAPSHOT_FILES) {
    const target = style.join(staging, ...relative.split('/'));
    await copyFile(style.join(snapshotPath, 'payload', ...relative.split('/')), target, constants.COPYFILE_EXCL);
    await flushCopiedFile(target);
  }
  await validateRestoredRuntime(staging);
  await runtimeMatchesSnapshot(staging, snapshotPath);
}

export async function restoreRuntime(options: {
  runtimeRoot: string;
  backupRoot: string;
  snapshotId: string;
  confirmRestore: string;
  confirmInvalidRuntime?: boolean;
  confirmAbsentRuntime?: boolean;
  auditAppender?: typeof appendSnapshotAudit;
  snapshotCreator?: typeof createRuntimeSnapshot;
  faultHook?: RestoreFaultHook;
  restoreStagingRemover?: (path: string) => Promise<void>;
  lockReleaser?: typeof releaseRuntimeOperationLock;
  journalRemover?: typeof removeRuntimeRestoreJournal;
}): Promise<RestoreResult> {
  if (options.confirmRestore !== options.snapshotId) throw new Error('RESTORE_CONFIRMATION_REQUIRED');
  const resolved = await assertRestorePaths(options.runtimeRoot, options.backupRoot, options.snapshotId);
  if (await readRuntimeRestoreJournal(resolved.runtimeRoot)) throw new Error('RESTORE_RECOVERY_REQUIRED');
  await verifyRuntimeSnapshot(resolved.snapshotPath);
  const lock = await acquireRuntimeOperationLock({ runtimeRoot: resolved.runtimeRoot, operation: 'restore' });
  let sourceState: CurrentRuntimeState;
  try { sourceState = await classifyCurrentRuntime(resolved.runtimeRoot); }
  catch (error) { await releaseRuntimeOperationLock(lock).catch(() => undefined); throw error; }
  if (sourceState !== 'valid' && sourceState !== 'absent' && !options.confirmInvalidRuntime) {
    await releaseRuntimeOperationLock(lock);
    throw new Error('RESTORE_INVALID_RUNTIME_CONFIRMATION_REQUIRED');
  }
  if (sourceState === 'absent' && !options.confirmAbsentRuntime) {
    await releaseRuntimeOperationLock(lock);
    throw new Error('RESTORE_ABSENT_RUNTIME_CONFIRMATION_REQUIRED');
  }
  const operationId = lock.owner.operationId;
  const restorePaths = paths(resolved.runtimeRoot, operationId, sourceState);
  let journal: RuntimeRestoreJournal = {
    schemaVersion: 2, operationId, selectedSnapshotId: options.snapshotId,
    startedAt: new Date().toISOString(),
    source: {
      state: sourceState,
      protection: sourceState === 'valid'
        ? { kind: 'snapshot', snapshotId: 'pending' }
        : sourceState === 'absent' ? { kind: 'none' } : { kind: 'evidence-only' },
    },
    decision: 'undecided', transition: 'prepare', transitionState: 'intent',
  };
  let destructive = false;
  let finalized = false;
  const update = async (
    transition: RestoreTransition,
    transitionState: 'intent' | 'complete',
    additions: Partial<RuntimeRestoreJournal> = {},
    faultPoint?: RestoreFaultPoint,
  ) => {
    journal = { ...journal, ...additions, transition, transitionState };
    await writeRuntimeRestoreJournal(resolved.runtimeRoot, journal);
    if (faultPoint) await options.faultHook?.(faultPoint);
  };
  try {
    await writeRuntimeRestoreJournal(resolved.runtimeRoot, journal);
    await options.faultHook?.('locked');
    let preRestoreSnapshotId: string | undefined;
    if (sourceState === 'valid') {
      const protection = await (options.snapshotCreator ?? createRuntimeSnapshot)({
        runtimeRoot: resolved.runtimeRoot, backupRoot: resolved.backupRoot, heldLock: lock,
      });
      preRestoreSnapshotId = protection.snapshotId;
      await update('prepare', 'complete', {
        source: { state: sourceState, protection: { kind: 'snapshot', snapshotId: preRestoreSnapshotId } },
      }, 'protected');
    } else {
      await update('prepare', 'complete', {}, 'protected');
    }
    if (await pathExists(restorePaths.staging) || await pathExists(restorePaths.displaced)) throw new Error('RESTORE_PATH_EXISTS');
    await bestEffortSpaceCheck(resolved.style.dirname(resolved.runtimeRoot), (await estimateRuntimeBytes(resolved.snapshotPath)) * 2);
    await update('stage', 'intent', {}, 'staging');
    await stageSnapshot(resolved.snapshotPath, restorePaths.staging);
    await verifyRuntimeSnapshot(resolved.snapshotPath);
    await update('stage', 'complete', {}, 'staged');
    if (sourceState !== 'absent') {
      await update('displace', 'intent', {}, 'displacing-current');
      destructive = true;
      await rename(resolved.runtimeRoot, restorePaths.displaced);
      await options.faultHook?.('displaced-before-completion');
      await update('displace', 'complete', {}, 'current-displaced');
    } else {
      destructive = true;
      await update('displace', 'complete', {}, 'current-displaced');
    }
    await update('publish', 'intent', {}, 'publishing-replacement');
    await rename(restorePaths.staging, resolved.runtimeRoot);
    await options.faultHook?.('published-before-completion');
    await update('publish', 'complete', {}, 'replacement-published');
    await update('verify', 'intent', {}, 'verifying-restored');
    await validateRestoredRuntime(resolved.runtimeRoot);
    await runtimeMatchesSnapshot(resolved.runtimeRoot, resolved.snapshotPath);
    await update('verify', 'complete', { decision: 'forward' }, 'restored-verified');
    await update('finalize', 'intent', { outcome: 'restored' }, 'finalizing');
    let audit: RestoreResult['audit'] = 'recorded';
    try {
      await (options.auditAppender ?? appendSnapshotAudit)(resolved.backupRoot, {
        schemaVersion: 1, kind: 'eyos-snapshot-operation', operationId, operation: 'restore',
        snapshotId: options.snapshotId, preRestoreSnapshotId, sourceState,
        startedAt: journal.startedAt, finishedAt: new Date().toISOString(), status: 'succeeded',
      });
    } catch { audit = 'degraded'; }
    await releaseRuntimeOperationLock(lock);
    await removeRuntimeRestoreJournal(resolved.runtimeRoot);
    finalized = true;
    return {
      operationId, snapshotId: options.snapshotId, sourceState, preRestoreSnapshotId,
      ...(sourceState === 'absent' ? {} : { displacedPath: restorePaths.displaced }), audit,
    };
  } catch (error) {
    if (!destructive) {
      const cleanupFailures: Array<{
        step: RestoreCleanupStep;
        error: unknown;
      }> = [];
      if (error instanceof RuntimeSnapshotCleanupError) {
        cleanupFailures.push({
          step: 'mandatory-snapshot-staging',
          error: error.cleanupError,
        });
      }
      try {
        await (options.restoreStagingRemover ?? (path => rm(path, { recursive: true, force: true })))(restorePaths.staging);
      } catch (cleanupError) {
        cleanupFailures.push({ step: 'restore-staging', error: cleanupError });
      }
      let lockReleased = false;
      try {
        await (options.lockReleaser ?? releaseRuntimeOperationLock)(lock);
        lockReleased = true;
      } catch (cleanupError) {
        cleanupFailures.push({ step: 'operation-lock', error: cleanupError });
      }
      if (lockReleased && cleanupFailures.length === 0) {
        try {
          await (options.journalRemover ?? removeRuntimeRestoreJournal)(resolved.runtimeRoot);
        } catch (cleanupError) {
          cleanupFailures.push({ step: 'restore-journal', error: cleanupError });
        }
      }
      const reportedError = cleanupFailures.length > 0
        ? new RuntimeRestoreCleanupError(error, cleanupFailures)
        : error;
      await (options.auditAppender ?? appendSnapshotAudit)(resolved.backupRoot, {
        schemaVersion: 1, kind: 'eyos-snapshot-operation', operationId, operation: 'restore',
        snapshotId: options.snapshotId, sourceState, startedAt: journal.startedAt,
        finishedAt: new Date().toISOString(), status: 'failed',
        errorCode: reportedError instanceof Error && /^[A-Z0-9_]+$/.test(reportedError.message)
          ? reportedError.message
          : 'RESTORE_FAILED',
      }).catch(() => undefined);
      throw reportedError;
    }
    throw error;
  } finally {
    void finalized;
  }
}

export function getRestorePaths(runtimeRoot: string, operationId: string, state: CurrentRuntimeState) {
  return { ...paths(assertExternalRuntimePath(runtimeRoot), operationId, state), journal: getRuntimeRestoreJournalPath(runtimeRoot) };
}
