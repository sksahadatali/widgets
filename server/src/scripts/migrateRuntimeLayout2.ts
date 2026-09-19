import { migrateRuntimeLayout1To2 } from '../runtime/runtimeLayout2Migration.js';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const sourceRuntimePath = option('--source');
const targetRuntimePath = option('--target');
if (!sourceRuntimePath || !targetRuntimePath) throw new Error('Provide --source <layout-1-runtime> and --target <new-layout-2-runtime>.');
await migrateRuntimeLayout1To2({
  sourceRuntimePath,
  targetRuntimePath,
  confirmed: process.argv.includes('--confirm-layout-2-migration'),
});
console.log('Validated and published the copy-only Household runtime layout-2 target. The source runtime was not changed.');
