import { recoverRuntimeRestore } from '../runtime/runtimeRestoreRecovery.js';
import { parseArguments, requiredOption } from './runtimeCliArguments.js';

const options = parseArguments(['--root', '--backup-root', '--action', '--operation-id', '--confirm-recover']);
const action = requiredOption(options, '--action');
if (!['abort', 'rollback', 'complete'].includes(action)) throw new Error('--action must be abort, rollback or complete.');
const result = await recoverRuntimeRestore({
  runtimeRoot: requiredOption(options, '--root'), backupRoot: requiredOption(options, '--backup-root'),
  action: action as 'abort' | 'rollback' | 'complete',
  operationId: requiredOption(options, '--operation-id'),
  confirmRecover: options['--confirm-recover'] === true,
});
console.log(`Restore recovery completed: ${result.action}`);
if (result.audit === 'degraded') console.warn('WARNING: Recovery succeeded, but its audit record could not be appended.');
