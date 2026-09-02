import { migrateHouseholdConfig } from '../runtime/configMigration.js';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const sourcePath = option('--source');
const runtimeRoot = option('--root') ?? process.env.EYOS_RUNTIME_DIR;
if (!sourcePath || !runtimeRoot) throw new Error('Provide --source <absolute-path> and --root <absolute-path>.');
await migrateHouseholdConfig({ sourcePath, runtimeRoot });
console.log('Household configuration was validated and copied to the external runtime.');
