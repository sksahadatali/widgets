import { lstat, open } from 'node:fs/promises';
import { join } from 'node:path';

export type SnapshotAuditRecord = {
  schemaVersion: 1;
  kind: 'eyos-snapshot-operation';
  operationId: string;
  operation: 'create' | 'lock-clear';
  snapshotId?: string;
  startedAt: string;
  finishedAt: string;
  status: 'succeeded' | 'failed';
  fileCount?: number;
  totalBytes?: number;
  errorCode?: string;
};

export async function appendSnapshotAudit(
  backupRoot: string,
  record: SnapshotAuditRecord,
): Promise<void> {
  const path = join(backupRoot, 'operations.jsonl');
  const existing = await lstat(path).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  });
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) {
    throw new Error('Snapshot audit path is unsafe.');
  }
  const handle = await open(path, 'a', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(record)}\n`, 'utf8');
    await handle.sync();
  } finally { await handle.close(); }
}
