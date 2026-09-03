import { randomUUID } from 'node:crypto';
import { lstat, open, readFile, realpath, rename, rm } from 'node:fs/promises';

import { assertExternalRuntimePath, getAbsolutePathStyle } from '../config/runtimeData.js';

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

export async function writeRuntimeRestoreJournal(runtimeRoot: string, journal: RuntimeRestoreJournal): Promise<void> {
  validate(journal);
  const path = getRuntimeRestoreJournalPath(runtimeRoot);
  const style = getAbsolutePathStyle(path)!;
  await realpath(style.dirname(path));
  const temporary = `${path}.tmp-${journal.operationId}-${randomUUID()}`;
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(`${JSON.stringify(journal, null, 2)}\n`, 'utf8'); await handle.sync(); } finally { await handle.close(); }
  try { await rename(temporary, path); }
  catch (error) { await rm(temporary, { force: true }).catch(() => undefined); throw error; }
}

export async function removeRuntimeRestoreJournal(runtimeRoot: string): Promise<void> { await rm(getRuntimeRestoreJournalPath(runtimeRoot)); }
