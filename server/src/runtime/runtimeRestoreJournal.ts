import { randomUUID } from 'node:crypto';
import type { BigIntStats } from 'node:fs';
import { publishAtomicRename, type AtomicPublicationOptions } from './runtimeAtomicPublication.js';
import { lstat, open, readFile, realpath, rm } from 'node:fs/promises';

import { assertExternalRuntimePath, getAbsolutePathStyle } from '../config/runtimeData.js';
import { flushDirectory } from './runtimeDurability.js';

export const RESTORE_TRANSITIONS = ['prepare', 'stage', 'displace', 'publish', 'verify', 'rollback-quarantine', 'rollback-return', 'abort-cleanup', 'finalize'] as const;
export type RestoreTransition = typeof RESTORE_TRANSITIONS[number];
export type RestoreTransitionState = 'intent' | 'complete';
export type RestoreDecision = 'undecided' | 'forward' | 'rollback' | 'abort';
export type RestoreOutcome = 'restored' | 'rolled-back' | 'aborted';
export type CurrentRuntimeState = 'valid' | 'invalid' | 'incomplete' | 'absent';
export type RestoreProtection = { kind: 'snapshot'; snapshotId: string } | { kind: 'evidence-only' } | { kind: 'none' };

export type RuntimeRestoreJournal = {
  schemaVersion: 2;
  operationId: string;
  selectedSnapshotId: string;
  startedAt: string;
  source: { state: CurrentRuntimeState; protection: RestoreProtection };
  decision: RestoreDecision;
  transition: RestoreTransition;
  transitionState: RestoreTransitionState;
  outcome?: RestoreOutcome;
};

export function getRuntimeRestoreJournalPath(runtimeRoot: string): string {
  const root = assertExternalRuntimePath(runtimeRoot);
  const style = getAbsolutePathStyle(root)!;
  return style.join(style.dirname(root), `.${style.basename(root)}.restore-state.json`);
}

function exactKeys(record: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(record).every(key => allowed.includes(key));
}

function validate(value: unknown): RuntimeRestoreJournal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('RESTORE_JOURNAL_INVALID');
  const record = value as Record<string, unknown>;
  if (!exactKeys(record, ['schemaVersion', 'operationId', 'selectedSnapshotId', 'startedAt', 'source', 'decision', 'transition', 'transitionState', 'outcome']) ||
    record.schemaVersion !== 2 || typeof record.operationId !== 'string' || !record.operationId ||
    typeof record.selectedSnapshotId !== 'string' || !record.selectedSnapshotId ||
    typeof record.startedAt !== 'string' || Number.isNaN(Date.parse(record.startedAt)) ||
    !['undecided', 'forward', 'rollback', 'abort'].includes(String(record.decision)) ||
    !RESTORE_TRANSITIONS.includes(record.transition as RestoreTransition) ||
    !['intent', 'complete'].includes(String(record.transitionState)) ||
    (record.outcome !== undefined && !['restored', 'rolled-back', 'aborted'].includes(String(record.outcome)))) throw new Error('RESTORE_JOURNAL_INVALID');
  const source = record.source;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('RESTORE_JOURNAL_INVALID');
  const sourceRecord = source as Record<string, unknown>;
  if (!exactKeys(sourceRecord, ['state', 'protection']) || !['valid', 'invalid', 'incomplete', 'absent'].includes(String(sourceRecord.state))) throw new Error('RESTORE_JOURNAL_INVALID');
  const protection = sourceRecord.protection;
  if (!protection || typeof protection !== 'object' || Array.isArray(protection)) throw new Error('RESTORE_JOURNAL_INVALID');
  const protectionRecord = protection as Record<string, unknown>;
  const kind = protectionRecord.kind;
  if (!['snapshot', 'evidence-only', 'none'].includes(String(kind)) || !exactKeys(protectionRecord, kind === 'snapshot' ? ['kind', 'snapshotId'] : ['kind']) ||
    (kind === 'snapshot' && (typeof protectionRecord.snapshotId !== 'string' || !protectionRecord.snapshotId))) throw new Error('RESTORE_JOURNAL_INVALID');
  if ((sourceRecord.state === 'valid') !== (kind === 'snapshot') ||
    (['invalid', 'incomplete'].includes(String(sourceRecord.state))) !== (kind === 'evidence-only') ||
    (sourceRecord.state === 'absent') !== (kind === 'none')) throw new Error('RESTORE_JOURNAL_INVALID');
  if (record.transition === 'finalize' && (!record.outcome || record.decision === 'undecided')) throw new Error('RESTORE_JOURNAL_INVALID');
  if (record.outcome && record.transition !== 'finalize') throw new Error('RESTORE_JOURNAL_INVALID');
  return record as RuntimeRestoreJournal;
}

export async function readRuntimeRestoreJournal(runtimeRoot: string): Promise<RuntimeRestoreJournal | null> {
  const path = getRuntimeRestoreJournalPath(runtimeRoot);
  const stats = await lstat(path).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; });
  if (!stats) return null;
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('RESTORE_JOURNAL_UNSAFE');
  try { return validate(JSON.parse(await readFile(path, 'utf8')) as unknown); }
  catch (error) { if (error instanceof Error && error.message === 'RESTORE_JOURNAL_INVALID') throw error; throw new Error('RESTORE_JOURNAL_INVALID', { cause: error }); }
}

type JournalHandle = Pick<Awaited<ReturnType<typeof open>>, 'writeFile' | 'sync' | 'close' | 'stat'>;
export type JournalPublicationOptions = AtomicPublicationOptions & {
  opener?: (path: string, flags: 'wx', mode: number) => Promise<JournalHandle>;
};
type FileObservation = { stats: BigIntStats; bytes: Buffer };
function sameObject(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.birthtimeNs === b.birthtimeNs;
}
function sameFile(a: BigIntStats, b: BigIntStats): boolean {
  return sameObject(a, b) && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}
async function observeFile(path: string): Promise<FileObservation | null> {
  const before = await lstat(path, { bigint: true }).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  });
  if (!before) return null;
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('RESTORE_JOURNAL_UNSAFE');
  const bytes = await readFile(path);
  const after = await lstat(path, { bigint: true });
  if (!after.isFile() || after.isSymbolicLink() || !sameFile(before, after)) throw new Error('RESTORE_JOURNAL_CHANGED');
  return { stats: after, bytes };
}

export async function writeRuntimeRestoreJournal(
  runtimeRoot: string,
  journal: RuntimeRestoreJournal,
  directoryFlusher: typeof flushDirectory = flushDirectory,
  publication: JournalPublicationOptions = {},
): Promise<JournalOwnership> {
  // Freeze this publication's semantic state before the first asynchronous call.
  const next = structuredClone(validate(journal));
  const bytes = Buffer.from(`${JSON.stringify(next, null, 2)}\n`, 'utf8');
  const path = getRuntimeRestoreJournalPath(runtimeRoot);
  const style = getAbsolutePathStyle(path)!;
  const parent = style.dirname(path);
  const parentStats = await lstat(parent, { bigint: true });
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) throw new Error('RESTORE_JOURNAL_LOCATION_UNSAFE');
  const parentReal = await realpath(parent);
  const assertParentSame = async () => {
    const current = await lstat(parent, { bigint: true });
    if (!current.isDirectory() || current.isSymbolicLink() || !sameObject(parentStats, current) ||
      await realpath(parent) !== parentReal) throw new Error('RESTORE_JOURNAL_LOCATION_CHANGED');
  };
  const previous = await observeFile(path);
  const initial = next.transition === 'prepare' && next.transitionState === 'intent' && next.decision === 'undecided';
  if (initial && previous) throw new Error('RESTORE_JOURNAL_EXISTS');
  if (!initial && !previous) throw new Error('RESTORE_JOURNAL_MISSING');
  if (previous) {
    let established: RuntimeRestoreJournal;
    try { established = validate(JSON.parse(previous.bytes.toString('utf8'))); }
    catch { throw new Error('RESTORE_JOURNAL_INVALID'); }
    if (established.operationId !== next.operationId || established.selectedSnapshotId !== next.selectedSnapshotId ||
      established.startedAt !== next.startedAt || established.source.state !== next.source.state) throw new Error('RESTORE_JOURNAL_FOREIGN');
    if (established.decision !== 'undecided' && established.decision !== next.decision) throw new Error('RESTORE_STATE_AMBIGUOUS');
  }
  const temporary = `${path}.tmp-${next.operationId}-${randomUUID()}`;
  const handle = await (publication.opener ?? open)(temporary, 'wx', 0o600);
  let owned: BigIntStats | undefined;
  let ready: BigIntStats | undefined;
  try {
    try {
      owned = await handle.stat({ bigint: true });
      await handle.writeFile(bytes);
      await handle.sync();
    } finally { await handle.close(); }
    const staged = await observeFile(temporary);
    if (!staged || !owned || !sameObject(owned, staged.stats) || !bytes.equals(staged.bytes)) throw new Error('RESTORE_JOURNAL_TEMPORARY_CHANGED');
    ready = staged.stats;
    await publishAtomicRename({
      source: temporary,
      target: path,
      platform: publication.platform,
      renamer: publication.renamer,
      sleeper: publication.sleeper,
      beforeAttempt: async () => {
        await assertParentSame();
        const source = await observeFile(temporary);
        if (!source || !ready || !sameFile(ready, source.stats) || !bytes.equals(source.bytes)) throw new Error('RESTORE_JOURNAL_TEMPORARY_CHANGED');
        const current = await observeFile(path);
        if (!previous ? current !== null : !current || !sameFile(previous.stats, current.stats) || !previous.bytes.equals(current.bytes)) {
          throw new Error('RESTORE_JOURNAL_CHANGED');
        }
      },
    });
    await directoryFlusher(parent);
    await assertParentSame();
    const published = await observeFile(path);
    if (!published || !owned || !sameObject(owned, published.stats) || !bytes.equals(published.bytes)) throw new Error('RESTORE_JOURNAL_CHANGED');
    // This receipt describes the actual published file, not merely an operation ID.
    return {
      remove: async (remover = removeRuntimeRestoreJournal) => {
        await assertParentSame();
        const current = await observeFile(path);
        if (!current || !sameFile(published.stats, current.stats) || !published.bytes.equals(current.bytes)) throw new Error('RESTORE_JOURNAL_CHANGED');
        validate(JSON.parse(current.bytes.toString('utf8')));
        await assertParentSame();
        const final = await lstat(path, { bigint: true });
        if (!final.isFile() || final.isSymbolicLink() || !sameFile(published.stats, final)) throw new Error('RESTORE_JOURNAL_CHANGED');
        // Node has no portable identity-conditional unlink. Recheck immediately
        // before removal under the cooperative operation/journal protocol. An
        // uncooperative external replacement after this check is NOT filesystem CAS.
        await remover(runtimeRoot);
      },
    };
  } catch (error) {
    // Only our unchanged owned temporary is removable. Never delete a destination
    // or an unexpected replacement to make publication succeed. The operation lock
    // remains the cooperative writer boundary; these checks are not filesystem CAS.
    try {
      await assertParentSame();
      const source = await observeFile(temporary);
      if (source && owned && sameObject(owned, source.stats) && bytes.equals(source.bytes) && (!ready || sameFile(ready, source.stats))) {
        await rm(temporary);
      }
    } catch { /* preserve the publication failure and any uncertain evidence */ }
    throw error;
  }
}

export async function removeRuntimeRestoreJournal(runtimeRoot: string): Promise<void> { await rm(getRuntimeRestoreJournalPath(runtimeRoot)); }

/** In-memory receipt only; no journal/runtime schema change. */
export type JournalOwnership = {
  remove: (remover?: typeof removeRuntimeRestoreJournal) => Promise<void>;
};

export async function cleanupOwnedRuntimeRestoreJournal(
  runtimeRoot: string,
  ownership: JournalOwnership | undefined,
  remover: typeof removeRuntimeRestoreJournal = removeRuntimeRestoreJournal,
): Promise<void> {
  if (ownership) return ownership.remove(remover);
  // Initial publication may have failed before creating a journal. Never claim
  // an existing destination when no successful publication receipt was obtained.
  if (await observeFile(getRuntimeRestoreJournalPath(runtimeRoot))) throw new Error('RESTORE_JOURNAL_CHANGED');
}
