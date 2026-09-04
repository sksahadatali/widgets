import { inspectRuntimeRestore } from '../runtime/runtimeRestoreRecovery.js';
import { parseArguments, requiredOption } from './runtimeCliArguments.js';

const options = parseArguments(['--root']);
const result = await inspectRuntimeRestore(requiredOption(options, '--root'));
if (!result.journal) console.log('No restore journal exists.');
else {
  console.log(`Operation ID: ${result.journal.operationId}`);
  console.log(`Snapshot ID: ${result.journal.selectedSnapshotId}`);
  console.log(`Decision: ${result.journal.decision}`);
  console.log(`Transition: ${result.journal.transition}/${result.journal.transitionState}`);
  console.log(`Current runtime state: ${result.journal.source.state}`);
  console.log(`Restore lock present: ${result.lockOperationId === result.journal.operationId ? 'yes' : 'no'}`);
  console.log(`Runtime present: ${result.runtimeExists ? 'yes' : 'no'}`);
  console.log(`Staging present: ${result.stagingExists ? 'yes' : 'no'}`);
  console.log(`Displaced runtime present: ${result.displacedExists ? 'yes' : 'no'}`);
}
