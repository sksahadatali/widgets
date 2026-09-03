import { createRuntimeSnapshot } from '../runtime/runtimeSnapshot.js';
import { parseArguments, requiredOption } from './runtimeCliArguments.js';

const options = parseArguments(['--root', '--backup-root']);
const result = await createRuntimeSnapshot({
  runtimeRoot: requiredOption(options, '--root'),
  backupRoot: requiredOption(options, '--backup-root'),
});

console.log(`Snapshot created and independently verified: ${result.snapshotId}`);
console.log(`Snapshot path: ${result.snapshotPath}`);
console.log(`Files: ${result.fileCount}`);
console.log(`Bytes: ${result.totalBytes}`);
if (result.audit === 'degraded') {
  console.warn('WARNING: The valid snapshot was published, but its audit record could not be appended.');
}
