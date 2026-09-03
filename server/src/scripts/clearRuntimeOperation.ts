import { randomUUID } from 'node:crypto';

import { clearRuntimeOperationLock } from '../runtime/runtimeOperationLock.js';
import { appendSnapshotAudit } from '../runtime/runtimeSnapshotAudit.js';
import { parseArguments, requiredOption } from './runtimeCliArguments.js';

const options = parseArguments([
  '--root', '--backup-root', '--operation-id', '--confirm-clear', '--confirm-orphaned-lock',
]);
const startedAt = new Date().toISOString();
const backupRoot = requiredOption(options, '--backup-root');
const result = await clearRuntimeOperationLock({
  runtimeRoot: requiredOption(options, '--root'),
  operationId: typeof options['--operation-id'] === 'string' ? options['--operation-id'] : undefined,
  confirmClear: options['--confirm-clear'] === true,
  confirmOrphaned: options['--confirm-orphaned-lock'] === true,
});
if (result === 'cleared') {
  try {
    await appendSnapshotAudit(backupRoot, {
      schemaVersion: 1, kind: 'eyos-snapshot-operation', operationId: randomUUID(),
      operation: 'lock-clear', startedAt, finishedAt: new Date().toISOString(), status: 'succeeded',
    });
  } catch {
    console.warn('WARNING: The runtime lock was cleared, but its audit record could not be appended.');
  }
}
console.log(result === 'cleared' ? 'Runtime operation lock cleared.' : 'No runtime operation lock exists.');
