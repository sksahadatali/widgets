import { fileURLToPath } from 'node:url';

import { migrateRuntimeData } from '../runtime/runtimeMigration.js';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0
    ? process.argv[index + 1]
    : undefined;
}

const sourceDataPath = option('--source') ??
  fileURLToPath(new URL('../../data/', import.meta.url));
const targetRuntimePath =
  option('--target') ?? process.env.EYOS_RUNTIME_DIR;

if (!targetRuntimePath) {
  throw new Error(
    'Provide --target <absolute-path> or EYOS_RUNTIME_DIR.'
  );
}

await migrateRuntimeData({
  sourceDataPath,
  targetRuntimePath,
});

console.log(
  `Validated and copied all six stores to ${targetRuntimePath}.`
);
