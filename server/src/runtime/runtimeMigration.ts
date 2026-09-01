import { createHash, randomUUID } from 'node:crypto';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
} from 'node:path';

import {
  assertExternalRuntimePath,
  EXPECTED_RUNTIME_MANIFEST,
  normalizeAbsolutePath,
  RUNTIME_DATA_DIRECTORY,
  RUNTIME_MANIFEST_NAME,
  RUNTIME_STORE_FILES,
} from '../config/runtimeData.js';
import { validateStoreSet } from './runtimeValidation.js';

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function sha256(path: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

function isWithin(parent: string, candidate: string): boolean {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === '' || (
    !pathFromParent.startsWith('..') &&
    !isAbsolute(pathFromParent)
  );
}

export async function migrateRuntimeData(options: {
  sourceDataPath: string;
  targetRuntimePath: string;
}): Promise<void> {
  const sourceDataPath = normalizeAbsolutePath(
    options.sourceDataPath,
    'Migration source'
  );
  const targetRuntimePath = assertExternalRuntimePath(
    options.targetRuntimePath
  );
  const sourceStats = await stat(sourceDataPath).catch(error => {
    throw new Error(
      'Migration source data directory does not exist.',
      { cause: error }
    );
  });

  if (!sourceStats.isDirectory()) {
    throw new Error(
      'Migration source must be a directory.'
    );
  }

  const sourceRealPath = await realpath(sourceDataPath);

  if (isWithin(sourceRealPath, targetRuntimePath)) {
    throw new Error(
      'Migration target must not be inside the source directory.'
    );
  }

  if (await pathExists(targetRuntimePath)) {
    throw new Error(
      'Migration target already exists; no files were changed.'
    );
  }

  await validateStoreSet(sourceDataPath);

  const targetParent = dirname(targetRuntimePath);
  await access(
    targetParent,
    constants.R_OK | constants.W_OK
  ).catch(error => {
    throw new Error(
      'Migration target parent must already exist and be writable.',
      { cause: error }
    );
  });
  assertExternalRuntimePath(
    join(
      await realpath(targetParent),
      basename(targetRuntimePath)
    )
  );

  const stagingPath = join(
    targetParent,
    `.${basename(targetRuntimePath)}.staging-${randomUUID()}`
  );
  const stagingDataPath = join(
    stagingPath,
    RUNTIME_DATA_DIRECTORY
  );

  try {
    await mkdir(stagingDataPath, { recursive: true });

    for (const fileName of RUNTIME_STORE_FILES) {
      const sourcePath = join(sourceDataPath, fileName);
      const targetPath = join(stagingDataPath, fileName);
      await copyFile(
        sourcePath,
        targetPath,
        constants.COPYFILE_EXCL
      );

      if (
        await sha256(sourcePath) !==
        await sha256(targetPath)
      ) {
        throw new Error(
          `SHA-256 verification failed for ${fileName}.`
        );
      }
    }

    await validateStoreSet(stagingDataPath);
    await writeFile(
      join(stagingPath, RUNTIME_MANIFEST_NAME),
      `${JSON.stringify(EXPECTED_RUNTIME_MANIFEST, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx' }
    );
    await rename(stagingPath, targetRuntimePath);
  } catch (error) {
    await rm(stagingPath, {
      recursive: true,
      force: true,
    });
    throw error;
  }
}
