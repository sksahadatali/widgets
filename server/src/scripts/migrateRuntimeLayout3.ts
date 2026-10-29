import { join } from 'node:path';
import { preflightIdentityReferences } from '../identity/identityPreflight.js';
import { migrateRuntimeLayout2To3 } from '../runtime/runtimeLayout3Migration.js';
import { verifyRuntimeSnapshot } from '../runtime/runtimeSnapshotValidation.js';

const args = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const sourceRuntimePath = option('--source');
const sourceSnapshotPath = option('--snapshot');
try {
  if (Boolean(sourceRuntimePath) === Boolean(sourceSnapshotPath)) throw new Error('PROVIDE_ONE_SOURCE_OR_SNAPSHOT');
  if (args.includes('--preflight')) {
    if (sourceSnapshotPath && (await verifyRuntimeSnapshot(sourceSnapshotPath)).dataLayoutVersion !== 2) throw new Error('EXPECTED_LAYOUT_2_SNAPSHOT');
    const result = await preflightIdentityReferences(sourceRuntimePath ?? join(sourceSnapshotPath!, 'payload'));
    console.log(JSON.stringify(result, null, 2));
    if (!result.canMigrate) process.exitCode = 1;
  } else {
    const targetRuntimePath = option('--target');
    if (!targetRuntimePath) throw new Error('PROVIDE_NEW_TARGET');
    const result = await migrateRuntimeLayout2To3({ sourceRuntimePath, sourceSnapshotPath, targetRuntimePath,
      identityFromRuntimePath: option('--identity-from'), confirmNewHousehold: args.includes('--confirm-new-household'),
      confirmed: args.includes('--confirm-layout-3-migration') });
    console.log(JSON.stringify(result, null, 2));
    console.log('Validated layout-3 target. Source unchanged. Retain the sibling identity migration journal; activation is a separate operator action.');
  }
} catch (error) {
  const message = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'IDENTITY_MIGRATION_FAILED';
  console.error(message);
  process.exitCode = 1;
}
