import {
  configureRuntimeData,
} from '../config/runtimeData.js';
import {
  preflightRuntimeData,
} from '../runtime/runtimeValidation.js';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0
    ? process.argv[index + 1]
    : undefined;
}

const positionalPath = process.argv[2]?.startsWith('--')
  ? undefined
  : process.argv[2];
const runtimeDirectory =
  option('--root') ??
  positionalPath ??
  process.env.EYOS_RUNTIME_DIR;

const runtime = configureRuntimeData({
  serverMode: 'production',
  appMode: 'household',
  runtimeDirectory,
});

await preflightRuntimeData(runtime);
console.log(
  `External Household runtime is valid: ${runtime.rootPath}`
);
