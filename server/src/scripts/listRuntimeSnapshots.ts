import { listRuntimeSnapshots } from '../runtime/runtimeSnapshot.js';
import { parseArguments, requiredOption } from './runtimeCliArguments.js';

const options = parseArguments(['--backup-root']);
const results = await listRuntimeSnapshots(requiredOption(options, '--backup-root'));
for (const result of results) {
  console.log(`${result.snapshotId} ${result.status}${result.totalBytes === undefined ? '' : ` ${result.totalBytes} bytes`}`);
}
if (results.length === 0) console.log('No published snapshots found.');
