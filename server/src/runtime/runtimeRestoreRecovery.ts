import { lstat, realpath, rename, rm } from 'node:fs/promises';

import { assertExternalPath, assertExternalRuntimePath, getAbsolutePathStyle, isPathWithin } from '../config/runtimeData.js';
import { inspectRuntimeOperationLock, releaseRuntimeOperationLock, type RuntimeOperationLock } from './runtimeOperationLock.js';
import { appendSnapshotAudit } from './runtimeSnapshotAudit.js';
import { verifyRuntimeSnapshot } from './runtimeSnapshotValidation.js';
import { readRuntimeRestoreJournal, removeRuntimeRestoreJournal, writeRuntimeRestoreJournal, type RuntimeRestoreJournal } from './runtimeRestoreJournal.js';
import { getRestorePaths } from './runtimeRestore.js';
import { runtimeMatchesSnapshot, validateProductionRuntime, validateRestoredRuntime } from './runtimeRestoreValidation.js';
import { flushDirectory } from './runtimeDurability.js';

type RuntimeDirectoryRenamer = (source: string, target: string) => Promise<void>;

export type RecoveryClassification = 'BEFORE' | 'AFTER' | 'TERMINAL' | 'AMBIGUOUS';
export type RestoreFilesystemObservation = {
  runtime: boolean; staging: boolean; displaced: boolean; failed: boolean;
  runtimeIsSelected?: boolean; stagingIsSelected?: boolean;
  runtimeIsProtected?: boolean; displacedIsProtected?: boolean;
};

/** Pure transaction classifier. It never reads or mutates the filesystem. */
export function classifyRestoreRecoveryState(
  journal: RuntimeRestoreJournal,
  observation: RestoreFilesystemObservation,
): RecoveryClassification {
  const { runtime: r, staging: s, displaced: d, failed: f } = observation;
  const absentSource = journal.source.state === 'absent';
  let before = false;
  let after = false;
  switch (journal.transition) {
    case 'prepare':
      after = r === !absentSource && !s && !d && !f;
      break;
    case 'stage':
      before = r === !absentSource && !d && !f;
      after = before && s && observation.stagingIsSelected === true;
      if (after) before = false;
      break;
    case 'displace':
      if (absentSource) after = !r && s && !d && !f && observation.stagingIsSelected === true;
      else {
        before = r && s && !d && !f && observation.runtimeIsProtected === true && observation.stagingIsSelected === true;
        after = !r && s && d && !f && observation.displacedIsProtected === true && observation.stagingIsSelected === true;
      }
      break;
    case 'publish':
      before = !r && s && d === !absentSource && !f && observation.stagingIsSelected === true && (absentSource || observation.displacedIsProtected === true);
      after = r && !s && d === !absentSource && !f && observation.runtimeIsSelected === true && (absentSource || observation.displacedIsProtected === true);
      break;
    case 'verify':
      after = r && !s && d === !absentSource && !f && observation.runtimeIsSelected === true && (absentSource || observation.displacedIsProtected === true);
      break;
    case 'rollback-quarantine':
      before = ((r && !s) || (!r && s)) && d === !absentSource && !f && (r ? observation.runtimeIsSelected === true : observation.stagingIsSelected === true) && (absentSource || observation.displacedIsProtected === true);
      after = !r && !s && d === !absentSource && f && (absentSource || observation.displacedIsProtected === true);
      break;
    case 'rollback-return':
      if (absentSource) after = !r && !s && !d && f;
      else {
        before = !r && !s && d && f && observation.displacedIsProtected === true;
        after = r && !s && !d && f && (journal.source.state === 'valid' ? observation.runtimeIsProtected === true : true);
      }
      break;
    case 'abort-cleanup':
      before = r === !absentSource && s && !d && !f;
      after = r === !absentSource && !s && !d && !f;
      break;
    case 'finalize': {
      const restored = journal.outcome === 'restored' && r && !s && d === !absentSource && !f && observation.runtimeIsSelected === true;
      const rolledBack = journal.outcome === 'rolled-back' && (absentSource ? !r && !s && !d && f : r && !s && !d && f && (journal.source.state === 'valid' ? observation.runtimeIsProtected === true : true));
      const aborted = journal.outcome === 'aborted' && r === !absentSource && !s && !d && !f;
      if (restored || rolledBack || aborted) return 'TERMINAL';
      return 'AMBIGUOUS';
    }
  }
  if (journal.transitionState === 'complete') return after ? 'AFTER' : 'AMBIGUOUS';
  if (before === after) return 'AMBIGUOUS';
  return before ? 'BEFORE' : 'AFTER';
}

async function existsSafeDirectory(path: string): Promise<boolean> {
  const value = await lstat(path).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; });
  if (!value) return false;
  if (!value.isDirectory() || value.isSymbolicLink()) throw new Error('RESTORE_STATE_AMBIGUOUS');
  return true;
}

export type RestoreInspection = { journal: RuntimeRestoreJournal | null; lockOperationId: string | null; runtimeExists: boolean; stagingExists: boolean; displacedExists: boolean };

export async function inspectRuntimeRestore(runtimeRootValue: string): Promise<RestoreInspection> {
  const runtimeRoot = assertExternalRuntimePath(runtimeRootValue);
  const journal = await readRuntimeRestoreJournal(runtimeRoot);
  const lock = await inspectRuntimeOperationLock(runtimeRoot);
  const restorePaths = journal ? getRestorePaths(runtimeRoot, journal.operationId, journal.source.state) : null;
  return { journal, lockOperationId: lock?.owner?.operation === 'restore' ? lock.owner.operationId : null,
    runtimeExists: await existsSafeDirectory(runtimeRoot), stagingExists: restorePaths ? await existsSafeDirectory(restorePaths.staging) : false,
    displacedExists: restorePaths ? await existsSafeDirectory(restorePaths.displaced) : false };
}

function ownedLock(operationId: string, inspected: Awaited<ReturnType<typeof inspectRuntimeOperationLock>>): RuntimeOperationLock {
  if (!inspected?.owner || inspected.owner.operation !== 'restore' || inspected.owner.operationId !== operationId) throw new Error('RESTORE_STATE_AMBIGUOUS');
  return { lockPath: inspected.lockPath, owner: inspected.owner };
}

async function matchesSelected(path: string, snapshotPath: string): Promise<boolean> {
  try { await validateRestoredRuntime(path); await runtimeMatchesSnapshot(path, snapshotPath); return true; } catch { return false; }
}

async function matchesProtected(path: string, backupRoot: string, journal: RuntimeRestoreJournal): Promise<boolean> {
  if (journal.source.state !== 'valid' || journal.source.protection.kind !== 'snapshot') return false;
  const style = getAbsolutePathStyle(path)!;
  const protectionPath = style.join(backupRoot, 'snapshots', journal.source.protection.snapshotId);
  try { await verifyRuntimeSnapshot(protectionPath); await validateProductionRuntime(path); await runtimeMatchesSnapshot(path, protectionPath); return true; } catch { return false; }
}

async function observe(runtimeRoot: string, backupRoot: string, snapshotPath: string, journal: RuntimeRestoreJournal) {
  const style = getAbsolutePathStyle(runtimeRoot)!;
  const paths = getRestorePaths(runtimeRoot, journal.operationId, journal.source.state);
  const failed = style.join(style.dirname(runtimeRoot), `.${style.basename(runtimeRoot)}.failed-replacement-${journal.operationId}`);
  const [runtime, staging, displaced, failedExists] = await Promise.all([runtimeRoot, paths.staging, paths.displaced, failed].map(existsSafeDirectory));
  return { paths, failed, observation: {
    runtime, staging, displaced, failed: failedExists,
    runtimeIsSelected: runtime && await matchesSelected(runtimeRoot, snapshotPath),
    stagingIsSelected: staging && await matchesSelected(paths.staging, snapshotPath),
    runtimeIsProtected: runtime && await matchesProtected(runtimeRoot, backupRoot, journal),
    displacedIsProtected: displaced && (journal.source.state === 'valid' ? await matchesProtected(paths.displaced, backupRoot, journal) : true),
  } satisfies RestoreFilesystemObservation };
}

async function persist(runtimeRoot: string, journal: RuntimeRestoreJournal, changes: Partial<RuntimeRestoreJournal>): Promise<RuntimeRestoreJournal> {
  const next = { ...journal, ...changes } as RuntimeRestoreJournal;
  await writeRuntimeRestoreJournal(runtimeRoot, next);
  return next;
}

export async function recoverRuntimeRestore(options: {
  runtimeRoot: string;
  backupRoot: string;
  action: 'abort' | 'rollback' | 'complete';
  operationId: string;
  confirmRecover: boolean;
  auditAppender?: typeof appendSnapshotAudit;
  runtimeRenamer?: RuntimeDirectoryRenamer;
  directoryFlusher?: typeof flushDirectory;
}): Promise<{ action: 'abort' | 'rollback' | 'complete'; audit: 'recorded' | 'degraded' }> {
  if (!options.confirmRecover) throw new Error('RESTORE_RECOVERY_CONFIRMATION_REQUIRED');
  const runtimeRoot = assertExternalRuntimePath(options.runtimeRoot);
  const backupRoot = assertExternalPath(options.backupRoot, 'Backup root');
  const backupStats = await lstat(backupRoot).catch(() => { throw new Error('RESTORE_BACKUP_ROOT_MISSING'); });
  if (!backupStats.isDirectory() || backupStats.isSymbolicLink()) throw new Error('RESTORE_BACKUP_ROOT_UNSAFE');
  const backupReal = await realpath(backupRoot);
  if (isPathWithin(runtimeRoot, backupReal) || isPathWithin(backupReal, runtimeRoot)) throw new Error('RESTORE_PATH_CONTAINMENT');
  let journal = await readRuntimeRestoreJournal(runtimeRoot);
  if (!journal || journal.operationId !== options.operationId) throw new Error('RESTORE_STATE_AMBIGUOUS');
  const style = getAbsolutePathStyle(runtimeRoot)!;
  const runtimeParent = style.dirname(runtimeRoot);
  const runtimeRenamer = options.runtimeRenamer ?? rename;
  const directoryFlusher = options.directoryFlusher ?? flushDirectory;
  const renameDurably = async (source: string, target: string) => {
    await runtimeRenamer(source, target);
    await directoryFlusher(runtimeParent);
  };
  const snapshotPath = style.join(backupRoot, 'snapshots', journal.selectedSnapshotId);
  await verifyRuntimeSnapshot(snapshotPath);

  const expectedDecision = options.action === 'complete' ? 'forward' : options.action;
  if (journal.decision !== 'undecided' && journal.decision !== expectedDecision) throw new Error('RESTORE_STATE_AMBIGUOUS');
  let lockInspection = await inspectRuntimeOperationLock(runtimeRoot);
  let lock: RuntimeOperationLock | null = null;
  if (journal.transition !== 'finalize') lock = ownedLock(journal.operationId, lockInspection);
  else if (lockInspection) lock = ownedLock(journal.operationId, lockInspection);

  let state = await observe(runtimeRoot, backupRoot, snapshotPath, journal);
  let classification = classifyRestoreRecoveryState(journal, state.observation);
  if (classification === 'AMBIGUOUS') throw new Error('RESTORE_STATE_AMBIGUOUS');

  if (journal.transition === 'finalize') {
    if (classification !== 'TERMINAL' || journal.decision !== expectedDecision) throw new Error('RESTORE_STATE_AMBIGUOUS');
    if (!lock && journal.outcome !== 'restored' && journal.source.state !== 'absent' &&
      !(journal.source.state === 'valid' && state.observation.runtimeIsProtected === true)) {
      throw new Error('RESTORE_STATE_AMBIGUOUS');
    }
  } else if (options.action === 'abort') {
    if (!['prepare', 'stage', 'abort-cleanup'].includes(journal.transition)) throw new Error('RESTORE_STATE_AMBIGUOUS');
    if (journal.transition !== 'abort-cleanup') journal = await persist(runtimeRoot, journal, { decision: 'abort', transition: 'abort-cleanup', transitionState: 'intent' });
    state = await observe(runtimeRoot, backupRoot, snapshotPath, journal);
    classification = classifyRestoreRecoveryState(journal, state.observation);
    if (classification === 'BEFORE') {
      await rm(state.paths.staging, { recursive: true, force: false });
      await directoryFlusher(runtimeParent);
    }
    else if (classification !== 'AFTER') throw new Error('RESTORE_STATE_AMBIGUOUS');
    journal = await persist(runtimeRoot, journal, { transitionState: 'complete' });
    journal = await persist(runtimeRoot, journal, { transition: 'finalize', transitionState: 'intent', outcome: 'aborted' });
  } else if (options.action === 'complete') {
    if (journal.decision === 'undecided') journal = await persist(runtimeRoot, journal, { decision: 'forward' });
    if (journal.decision === 'forward' && journal.transition === 'verify' && journal.transitionState === 'complete') {
      journal = await persist(runtimeRoot, journal, { transition: 'finalize', transitionState: 'intent', outcome: 'restored' });
    } else {
      if (journal.transition === 'displace' && journal.transitionState === 'intent') {
        if (classification === 'BEFORE') await renameDurably(runtimeRoot, state.paths.displaced);
        journal = await persist(runtimeRoot, journal, { transitionState: 'complete' });
      }
      if (journal.transition === 'displace') journal = await persist(runtimeRoot, journal, { decision: 'forward', transition: 'publish', transitionState: 'intent' });
      state = await observe(runtimeRoot, backupRoot, snapshotPath, journal);
      classification = classifyRestoreRecoveryState(journal, state.observation);
      if (journal.transition === 'publish') {
        if (classification === 'BEFORE') await renameDurably(state.paths.staging, runtimeRoot);
        else if (classification !== 'AFTER') throw new Error('RESTORE_STATE_AMBIGUOUS');
        journal = await persist(runtimeRoot, journal, { transitionState: 'complete' });
        journal = await persist(runtimeRoot, journal, { transition: 'verify', transitionState: 'intent' });
      }
      await validateRestoredRuntime(runtimeRoot); await runtimeMatchesSnapshot(runtimeRoot, snapshotPath);
      journal = await persist(runtimeRoot, journal, { decision: 'forward', transition: 'verify', transitionState: 'complete' });
      journal = await persist(runtimeRoot, journal, { transition: 'finalize', transitionState: 'intent', outcome: 'restored' });
    }
  } else {
    if (journal.decision === 'forward' && journal.transition === 'verify' && journal.transitionState === 'complete') throw new Error('RESTORE_STATE_AMBIGUOUS');
    if (!['displace', 'publish', 'verify', 'rollback-quarantine', 'rollback-return'].includes(journal.transition)) throw new Error('RESTORE_STATE_AMBIGUOUS');
    if (!['rollback-quarantine', 'rollback-return'].includes(journal.transition)) journal = await persist(runtimeRoot, journal, { decision: 'rollback', transition: 'rollback-quarantine', transitionState: 'intent' });
    state = await observe(runtimeRoot, backupRoot, snapshotPath, journal);
    classification = classifyRestoreRecoveryState(journal, state.observation);
    if (journal.transition === 'rollback-quarantine') {
      if (classification === 'BEFORE') await renameDurably(state.observation.runtime ? runtimeRoot : state.paths.staging, state.failed);
      else if (classification !== 'AFTER') throw new Error('RESTORE_STATE_AMBIGUOUS');
      journal = await persist(runtimeRoot, journal, { transitionState: 'complete' });
      journal = await persist(runtimeRoot, journal, { transition: 'rollback-return', transitionState: 'intent' });
    }
    state = await observe(runtimeRoot, backupRoot, snapshotPath, journal);
    classification = classifyRestoreRecoveryState(journal, state.observation);
    if (classification === 'BEFORE') await renameDurably(state.paths.displaced, runtimeRoot);
    else if (classification !== 'AFTER') throw new Error('RESTORE_STATE_AMBIGUOUS');
    if (journal.source.state === 'valid' && !await matchesProtected(runtimeRoot, backupRoot, journal)) throw new Error('RESTORE_STATE_AMBIGUOUS');
    journal = await persist(runtimeRoot, journal, { transitionState: 'complete' });
    journal = await persist(runtimeRoot, journal, { transition: 'finalize', transitionState: 'intent', outcome: 'rolled-back' });
  }

  state = await observe(runtimeRoot, backupRoot, snapshotPath, journal);
  if (classifyRestoreRecoveryState(journal, state.observation) !== 'TERMINAL') throw new Error('RESTORE_STATE_AMBIGUOUS');
  let audit: 'recorded' | 'degraded' = 'recorded';
  try { await (options.auditAppender ?? appendSnapshotAudit)(backupRoot, { schemaVersion: 1, kind: 'eyos-snapshot-operation', operationId: journal.operationId, operation: 'restore-recover', recoveryAction: options.action, snapshotId: journal.selectedSnapshotId, sourceState: journal.source.state, startedAt: journal.startedAt, finishedAt: new Date().toISOString(), status: 'succeeded' }); } catch { audit = 'degraded'; }
  if (lock) await releaseRuntimeOperationLock(lock);
  await removeRuntimeRestoreJournal(runtimeRoot);
  return { action: options.action, audit };
}
