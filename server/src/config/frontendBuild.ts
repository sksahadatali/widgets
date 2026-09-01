import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { RuntimeAppMode } from './runtimeData.js';

export const DEFAULT_FRONTEND_DIST_PATH =
  fileURLToPath(
    new URL('../../../app/dist/', import.meta.url)
  );

export type FrontendBuildMetadata = {
  schemaVersion: 1;
  appMode: RuntimeAppMode;
};

export async function readFrontendBuildMetadata(
  frontendDistPath = DEFAULT_FRONTEND_DIST_PATH
): Promise<FrontendBuildMetadata> {
  const metadataPath = join(
    frontendDistPath,
    'eyos-build.json'
  );
  let value: unknown;

  try {
    value = JSON.parse(
      await readFile(metadataPath, 'utf8')
    ) as unknown;
  } catch {
    throw new Error(
      'Production frontend build metadata is missing or malformed. ' +
      'Run the production build before starting eY OS.'
    );
  }

  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).schemaVersion !== 1 ||
    !['household', 'demo'].includes(
      String((value as Record<string, unknown>).appMode)
    ) ||
    Object.keys(value).some(key =>
      !['schemaVersion', 'appMode'].includes(key)
    )
  ) {
    throw new Error(
      'Production frontend build metadata is invalid.'
    );
  }

  return value as FrontendBuildMetadata;
}
