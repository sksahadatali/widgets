import { restoreRuntime } from '../runtime/runtimeRestore.js';
import { parseArguments, requiredOption } from './runtimeCliArguments.js';

const options = parseArguments([
  '--root', '--backup-root', '--snapshot', '--confirm-restore',
  '--confirm-invalid-runtime', '--confirm-absent-runtime',
]);
const result = await restoreRuntime({
  runtimeRoot: requiredOption(options, '--root'),
  backupRoot: requiredOption(options, '--backup-root'),
  snapshotId: requiredOption(options, '--snapshot'),
  confirmRestore: requiredOption(options, '--confirm-restore'),
  confirmInvalidRuntime: options['--confirm-invalid-runtime'] === true,
  confirmAbsentRuntime: options['--confirm-absent-runtime'] === true,
});
console.log(`Runtime restored and independently verified from snapshot: ${result.snapshotId}`);
console.log(`Operation ID: ${result.operationId}`);
console.log(`Previous runtime state: ${result.sourceState}`);
if (result.preRestoreSnapshotId) console.log(`Validated pre-restore snapshot: ${result.preRestoreSnapshotId}`);
if (result.displacedPath) console.log('The displaced runtime was preserved for explicit later cleanup.');
if (result.audit === 'degraded') console.warn('WARNING: Restore succeeded and verified, but its audit record could not be appended.');
