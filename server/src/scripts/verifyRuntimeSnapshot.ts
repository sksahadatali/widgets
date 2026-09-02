import { verifyRuntimeSnapshot } from '../runtime/runtimeSnapshotValidation.js';
import { parseArguments, requiredOption } from './runtimeCliArguments.js';

const options = parseArguments(['--snapshot']);
const result = await verifyRuntimeSnapshot(requiredOption(options, '--snapshot'));
console.log(`Snapshot verified: ${result.snapshotId}`);
console.log(`Files: ${result.fileCount}`);
console.log(`Bytes: ${result.totalBytes}`);
