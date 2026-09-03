import {
  HOUSEHOLD_CONFIG_FILE,
  RUNTIME_CONFIG_DIRECTORY,
} from '../config/householdConfig.js';
import {
  RUNTIME_DATA_DIRECTORY,
  RUNTIME_MANIFEST_NAME,
  RUNTIME_STORE_FILES,
} from '../config/runtimeData.js';

export const RUNTIME_SNAPSHOT_FILES = [
  RUNTIME_MANIFEST_NAME,
  `${RUNTIME_CONFIG_DIRECTORY}/${HOUSEHOLD_CONFIG_FILE}`,
  ...RUNTIME_STORE_FILES.map(file => `${RUNTIME_DATA_DIRECTORY}/${file}`),
] as const;

export type RuntimeSnapshotFile = typeof RUNTIME_SNAPSHOT_FILES[number];

export const RUNTIME_SNAPSHOT_FILE_SET = new Set<string>(RUNTIME_SNAPSHOT_FILES);
