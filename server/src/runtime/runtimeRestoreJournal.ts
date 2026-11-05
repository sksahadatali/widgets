import { createHash, randomUUID } from 'node:crypto';
import type { BigIntStats } from 'node:fs';
import { publishAtomicRename, type AtomicPublicationOptions } from './runtimeAtomicPublication.js';
import { lstat, open, readFile, realpath, rename, rm } from 'node:fs/promises';

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
    record.schemaVersion !== 2 || typeof record.operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(record.operationId) ||
    typeof record.selectedSnapshotId !== 'string' || !/^\d{8}T\d{6}\.\d{3}Z-[0-9a-f]{8}$/.test(record.selectedSnapshotId) ||
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
    (kind === 'snapshot' && (typeof protectionRecord.snapshotId !== 'string' || (protectionRecord.snapshotId !== 'pending' && !/^\d{8}T\d{6}\.\d{3}Z-[0-9a-f]{8}$/.test(protectionRecord.snapshotId))))) throw new Error('RESTORE_JOURNAL_INVALID');
  if ((sourceRecord.state === 'valid') !== (kind === 'snapshot') ||
    (['invalid', 'incomplete'].includes(String(sourceRecord.state))) !== (kind === 'evidence-only') ||
    (sourceRecord.state === 'absent') !== (kind === 'none')) throw new Error('RESTORE_JOURNAL_INVALID');
  if (record.transition === 'finalize' && (!record.outcome || record.decision === 'undecided')) throw new Error('RESTORE_JOURNAL_INVALID');
  if (record.outcome && record.transition !== 'finalize') throw new Error('RESTORE_JOURNAL_INVALID');
  return record as RuntimeRestoreJournal;
}

type JournalHandle = Pick<Awaited<ReturnType<typeof open>>, 'writeFile' | 'sync' | 'close' | 'stat'>;
export type JournalPublicationOptions = AtomicPublicationOptions & {
  opener?: (path: string, flags: 'wx', mode: number) => Promise<JournalHandle>;
  expected?: JournalOwnership;
};
type FileObservation = { stats: BigIntStats; bytes: Buffer };
// Windows creation/change/write timestamps are observations, not ownership IDs.
// Exact bytes are ALWAYS checked alongside identity; timestamps are never a CAS.
function sameObject(a: BigIntStats, b: BigIntStats): boolean {
  return a.ino !== 0n && b.ino !== 0n && a.dev === b.dev && a.ino === b.ino;
}
function sameFile(a: BigIntStats, b: BigIntStats): boolean {
  return sameObject(a, b) && a.size === b.size;
}
async function observeFile(path: string): Promise<FileObservation | null> {
  const before = await lstat(path, { bigint: true }).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  });
  if (!before) return null;
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('RESTORE_JOURNAL_UNSAFE');
  // Anchor the read to an open file. A replacement pathname cannot silently
  // substitute another file while the original handle remains open.
  const handle = await open(path, 'r');
  try {
    const bound = await handle.stat({ bigint: true });
    if (!bound.isFile() || !sameFile(before, bound)) throw new Error('RESTORE_JOURNAL_CHANGED');
    const bytes = await handle.readFile();
    const repeated = await readFile(path);
    const after = await handle.stat({ bigint: true });
    const named = await lstat(path, { bigint: true });
    if (!named.isFile() || named.isSymbolicLink() || !sameFile(bound, after) || !sameFile(bound, named) ||
      BigInt(bytes.length) !== after.size || !bytes.equals(repeated)) throw new Error('RESTORE_JOURNAL_CHANGED');
    return { stats: named, bytes };
  } finally { await handle.close(); }
}
async function locationGuard(runtimeRoot: string) {
  const path = getRuntimeRestoreJournalPath(runtimeRoot);
  const parent = getAbsolutePathStyle(path)!.dirname(path);
  const original = await lstat(parent, { bigint: true });
  if (!original.isDirectory() || original.isSymbolicLink()) throw new Error('RESTORE_JOURNAL_LOCATION_UNSAFE');
  const canonical = await realpath(parent);
  return async () => {
    const current = await lstat(parent, { bigint: true });
    if (!current.isDirectory() || current.isSymbolicLink() || !sameObject(original, current) ||
      await realpath(parent) !== canonical) throw new Error('RESTORE_JOURNAL_LOCATION_CHANGED');
  };
}
function parse(observation: FileObservation): RuntimeRestoreJournal {
  try { return validate(JSON.parse(observation.bytes.toString('utf8'))); }
  catch { throw new Error('RESTORE_JOURNAL_INVALID'); }
}
function receipt(runtimeRoot: string, published: FileObservation, guard: () => Promise<void>): JournalOwnership {
  const path = getRuntimeRestoreJournalPath(runtimeRoot);
  const journal = structuredClone(parse(published));
  const assertCurrent = async () => {
    await guard();
    const current = await observeFile(path);
    if (!current || !sameFile(published.stats, current.stats) || !published.bytes.equals(current.bytes)) throw new Error('RESTORE_JOURNAL_CHANGED');
    parse(current);
    await guard();
  };
  return {
    journal, sha256: createHash('sha256').update(published.bytes).digest('hex'), assertCurrent,
    remove: async (remover = removeRuntimeRestoreJournal) => {
      await assertCurrent();
      const final = await lstat(path, { bigint: true });
      if (!final.isFile() || final.isSymbolicLink() || !sameFile(published.stats, final)) throw new Error('RESTORE_JOURNAL_CHANGED');
      // No portable compare-and-unlink exists. The operation lock/journal
      // protocol is the cooperative boundary, not filesystem CAS.
      await remover(runtimeRoot);
    },
  };
}
export type JournalOwnership = {
  journal: RuntimeRestoreJournal;
  sha256: string;
  assertCurrent: () => Promise<void>;
  remove: (remover?: typeof removeRuntimeRestoreJournal) => Promise<void>;
};
export async function captureRuntimeRestoreJournal(runtimeRoot: string): Promise<JournalOwnership | null> {
  const guard = await locationGuard(runtimeRoot);
  const current = await observeFile(getRuntimeRestoreJournalPath(runtimeRoot));
  await guard();
  return current ? receipt(runtimeRoot, current, guard) : null;
}
export async function readRuntimeRestoreJournal(runtimeRoot: string): Promise<RuntimeRestoreJournal | null> {
  return (await captureRuntimeRestoreJournal(runtimeRoot))?.journal ?? null;
}
/** Rename returned successfully, but verification/durability did not complete.
 * A prior receipt MUST NOT be used to clean up this destination. */
export class RuntimeRestoreJournalPublicationError extends Error {
  constructor(readonly operationError: unknown) {
    super(`RESTORE_JOURNAL_PUBLICATION_UNCERTAIN: ${operationError instanceof Error ? operationError.message : 'publication failed'}`, { cause: operationError });
    this.name = 'RuntimeRestoreJournalPublicationError';
  }
}
export async function writeRuntimeRestoreJournal(
  runtimeRoot: string,
  journal: RuntimeRestoreJournal,
  directoryFlusher: typeof flushDirectory = flushDirectory,
  publication: JournalPublicationOptions = {},
): Promise<JournalOwnership> {
  const next = structuredClone(validate(journal));
  const bytes = Buffer.from(`${JSON.stringify(next, null, 2)}\n`, 'utf8');
  const path = getRuntimeRestoreJournalPath(runtimeRoot);
  const parent = getAbsolutePathStyle(path)!.dirname(path);
  const assertParentSame = await locationGuard(runtimeRoot);
  await publication.expected?.assertCurrent();
  const previous = await observeFile(path);
  const initial = next.transition === 'prepare' && next.transitionState === 'intent' && next.decision === 'undecided';
  if (initial && previous) throw new Error('RESTORE_JOURNAL_EXISTS');
  if (!initial && !previous) throw new Error('RESTORE_JOURNAL_MISSING');
  if (previous) {
    const established = parse(previous);
    if (established.operationId !== next.operationId || established.selectedSnapshotId !== next.selectedSnapshotId ||
      established.startedAt !== next.startedAt || established.source.state !== next.source.state) throw new Error('RESTORE_JOURNAL_FOREIGN');
    if (established.decision !== 'undecided' && established.decision !== next.decision) throw new Error('RESTORE_STATE_AMBIGUOUS');
  }
  const temporary = `${path}.tmp-${next.operationId}-${randomUUID()}`;
  const handle = await (publication.opener ?? open)(temporary, 'wx', 0o600);
  let owned: BigIntStats | undefined;
  let ready: BigIntStats | undefined;
  let renamed = false;
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
      source: temporary, target: path, platform: publication.platform,
      renamer: async (source, target) => {
        await (publication.renamer ?? rename)(source, target);
        renamed = true;
      },
      sleeper: publication.sleeper,
      beforeAttempt: async () => {
        await assertParentSame();
        await publication.expected?.assertCurrent();
        const source = await observeFile(temporary);
        if (!source || !ready || !sameFile(ready, source.stats) || !bytes.equals(source.bytes)) throw new Error('RESTORE_JOURNAL_TEMPORARY_CHANGED');
        const current = await observeFile(path);
        if (!previous ? current !== null : !current || !sameFile(previous.stats, current.stats) || !previous.bytes.equals(current.bytes)) throw new Error('RESTORE_JOURNAL_CHANGED');
      },
    });
    await directoryFlusher(parent);
    await assertParentSame();
    const published = await observeFile(path);
    if (!published || !owned || !sameObject(owned, published.stats) || !bytes.equals(published.bytes)) throw new Error('RESTORE_JOURNAL_CHANGED');
    return receipt(runtimeRoot, published, assertParentSame);
  } catch (error) {
    try {
      await assertParentSame();
      const source = await observeFile(temporary);
      if (source && owned && sameObject(owned, source.stats) && bytes.equals(source.bytes) && (!ready || sameFile(ready, source.stats))) await rm(temporary);
    } catch { /* preserve uncertain evidence and the original error */ }
    if (renamed) throw new RuntimeRestoreJournalPublicationError(error);
    throw error;
  }
}
export async function removeRuntimeRestoreJournal(runtimeRoot: string): Promise<void> { await rm(getRuntimeRestoreJournalPath(runtimeRoot)); }
export async function cleanupOwnedRuntimeRestoreJournal(
  runtimeRoot: string, ownership: JournalOwnership | undefined,
  remover: typeof removeRuntimeRestoreJournal = removeRuntimeRestoreJournal,
): Promise<void> {
  if (ownership) return ownership.remove(remover);
  if (await observeFile(getRuntimeRestoreJournalPath(runtimeRoot))) throw new Error('RESTORE_JOURNAL_CHANGED');
}
