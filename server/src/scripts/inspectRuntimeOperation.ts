import { inspectRuntimeOperationLock } from '../runtime/runtimeOperationLock.js';
import { parseArguments, requiredOption } from './runtimeCliArguments.js';

const options = parseArguments(['--root']);
const result = await inspectRuntimeOperationLock(requiredOption(options, '--root'));
if (!result) console.log('No runtime operation lock exists.');
else if (result.orphaned) console.log('An orphaned or malformed runtime operation lock exists.');
else {
  console.log(`Operation ID: ${result.owner!.operationId}`);
  console.log(`Operation: ${result.owner!.operation}`);
  console.log(`Created: ${result.owner!.createdAt}`);
  console.log(`PID: ${result.owner!.pid}`);
}
