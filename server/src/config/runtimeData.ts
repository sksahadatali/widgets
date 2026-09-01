import { fileURLToPath } from 'node:url';
import {
  posix,
  win32,
} from 'node:path';

export type StoreAccessPolicy =
  | 'initialize'
  | 'required'
  | 'disabled';

export type RuntimeAppMode =
  | 'household'
  | 'demo';

export const RUNTIME_MANIFEST_NAME = 'runtime.json';
export const RUNTIME_DATA_DIRECTORY = 'data';
export const RUNTIME_STORE_FILES = [
  'routines.local.json',
  'rewards.local.json',
  'redemptions.local.json',
  'lists.local.json',
  'meals.local.json',
  'kumon.local.json',
] as const;

export type RuntimeStoreFile =
  typeof RUNTIME_STORE_FILES[number];

export const EXPECTED_RUNTIME_MANIFEST = {
  schemaVersion: 1,
  kind: 'eyos-household-runtime',
  dataLayoutVersion: 1,
} as const;

const REPOSITORY_ROOT = fileURLToPath(
  new URL('../../../', import.meta.url)
);
const LOCAL_DATA_DIRECTORY = fileURLToPath(
  new URL('../../data/', import.meta.url)
);

export type RuntimeDataConfiguration = {
  appMode: RuntimeAppMode;
  rootPath: string | null;
  dataPath: string;
  policy: StoreAccessPolicy;
  external: boolean;
};

let configuration: RuntimeDataConfiguration = {
  appMode: 'household',
  rootPath: null,
  dataPath: LOCAL_DATA_DIRECTORY,
  policy: 'initialize',
  external: false,
};

function getAbsolutePathStyle(value: string) {
  if (posix.isAbsolute(value)) {
    return posix;
  }

  if (win32.isAbsolute(value)) {
    return win32;
  }

  return null;
}

function isWithin(
  parentPath: string,
  candidatePath: string
): boolean {
  const parentStyle = getAbsolutePathStyle(parentPath);
  const candidateStyle = getAbsolutePathStyle(candidatePath);

  if (
    !parentStyle ||
    !candidateStyle ||
    parentStyle !== candidateStyle
  ) {
    return false;
  }

  const pathFromParent = parentStyle.relative(
    parentStyle.resolve(parentPath),
    parentStyle.resolve(candidatePath)
  );

  return pathFromParent === '' || (
    !pathFromParent.startsWith('..') &&
    !parentStyle.isAbsolute(pathFromParent)
  );
}

export function normalizeAbsolutePath(
  value: string,
  label = 'EYOS_RUNTIME_DIR'
): string {
  const trimmed = value.trim();
  const pathStyle = getAbsolutePathStyle(trimmed);

  if (!pathStyle) {
    throw new Error(
      `${label} must be an absolute path.`
    );
  }

  return pathStyle.normalize(trimmed);
}

function joinAbsolutePath(
  rootPath: string,
  childPath: string
): string {
  const pathStyle = getAbsolutePathStyle(rootPath);

  if (!pathStyle) {
    throw new Error('Cannot join a relative runtime path.');
  }

  return pathStyle.join(rootPath, childPath);
}

export function assertExternalRuntimePath(
  runtimePath: string
): string {
  const normalized = normalizeAbsolutePath(runtimePath);

  if (isWithin(REPOSITORY_ROOT, normalized)) {
    throw new Error(
      'EYOS_RUNTIME_DIR must be outside the Git checkout.'
    );
  }

  return normalized;
}

export function configureRuntimeData(options: {
  serverMode: 'development' | 'production';
  appMode: RuntimeAppMode;
  runtimeDirectory?: string;
}): RuntimeDataConfiguration {
  if (options.appMode === 'demo') {
    configuration = {
      appMode: 'demo',
      rootPath: null,
      dataPath: LOCAL_DATA_DIRECTORY,
      policy: 'disabled',
      external: false,
    };
    return configuration;
  }

  const suppliedPath = options.runtimeDirectory?.trim();

  if (options.serverMode === 'production') {
    if (!suppliedPath) {
      throw new Error(
        'Household production requires EYOS_RUNTIME_DIR.'
      );
    }

    const rootPath = assertExternalRuntimePath(suppliedPath);
    configuration = {
      appMode: 'household',
      rootPath,
      dataPath: joinAbsolutePath(
        rootPath,
        RUNTIME_DATA_DIRECTORY
      ),
      policy: 'required',
      external: true,
    };
    return configuration;
  }

  if (suppliedPath) {
    const rootPath = assertExternalRuntimePath(suppliedPath);
    configuration = {
      appMode: 'household',
      rootPath,
      dataPath: joinAbsolutePath(
        rootPath,
        RUNTIME_DATA_DIRECTORY
      ),
      policy: 'required',
      external: true,
    };
    return configuration;
  }

  configuration = {
    appMode: 'household',
    rootPath: null,
    dataPath: LOCAL_DATA_DIRECTORY,
    policy: 'initialize',
    external: false,
  };
  return configuration;
}

export function getRuntimeDataConfiguration():
  RuntimeDataConfiguration {
  return configuration;
}

export function getRuntimeStoreOptions(
  fileName: RuntimeStoreFile
): {
  filePath: string;
  policy: StoreAccessPolicy;
} {
  return {
    filePath: joinAbsolutePath(
      configuration.dataPath,
      fileName
    ),
    policy: configuration.policy,
  };
}
