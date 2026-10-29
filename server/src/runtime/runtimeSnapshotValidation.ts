import { createHash } from 'node:crypto';
import {
  lstat,
  readFile,
  readdir,
  realpath,
  stat,
} from 'node:fs/promises';
import { basename, join } from 'node:path';

import { validateHouseholdConfig, validateHouseholdConfigV1 } from '../config/householdConfig.js';
import {
  assertExternalPath,
  isPathWithin,
  type RuntimeLayoutVersion,
} from '../config/runtimeData.js';
import {
  assertRuntimeManifest,
  validateStoreSet,
  validateHouseholdScope,
} from './runtimeValidation.js';
import {
  runtimeSnapshotFiles,
} from './runtimeSnapshotInventory.js';
import {
  SNAPSHOT_ID_PATTERN,
  validateSnapshotManifest,
} from './runtimeSnapshotManifest.js';

export type SnapshotVerification = {
  snapshotId: string;
  fileCount: number;
  totalBytes: number;
  dataLayoutVersion: RuntimeLayoutVersion;
};

function sorted(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b, 'en'));
}

function exactEntries(actual: string[], expected: string[], code: string): void {
  if (JSON.stringify(sorted(actual)) !== JSON.stringify(sorted(expected))) {
    throw new Error(code);
  }
}

async function assertSafeRegularFile(filePath: string, rootRealPath: string): Promise<void> {
  const entry = await lstat(filePath).catch(() => {
    throw new Error('SNAPSHOT_FILE_MISSING');
  });
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('SNAPSHOT_FILE_UNSAFE');
  const resolved = await realpath(filePath);
  if (!isPathWithin(rootRealPath, resolved)) throw new Error('SNAPSHOT_FILE_UNSAFE');
}

async function assertSafeDirectory(directoryPath: string, rootRealPath: string): Promise<void> {
  const entry = await lstat(directoryPath).catch(() => {
    throw new Error('SNAPSHOT_FILE_MISSING');
  });
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('SNAPSHOT_FILE_UNSAFE');
  if (!isPathWithin(rootRealPath, await realpath(directoryPath))) throw new Error('SNAPSHOT_FILE_UNSAFE');
}

async function hash(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

export async function verifyRuntimeSnapshot(
  suppliedPath: string,
  stagedSnapshotId?: string,
): Promise<SnapshotVerification> {
  const snapshotPath = assertExternalPath(suppliedPath, 'Snapshot path');
  const rootStats = await lstat(snapshotPath).catch(() => {
    throw new Error('SNAPSHOT_NOT_FOUND');
  });
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error('SNAPSHOT_PATH_UNSAFE');
  }
  const rootRealPath = await realpath(snapshotPath);
  const snapshotId = stagedSnapshotId ?? basename(snapshotPath);
  if (!SNAPSHOT_ID_PATTERN.test(snapshotId)) throw new Error('SNAPSHOT_ID_INVALID');
  exactEntries(await readdir(snapshotPath), ['snapshot.json', 'payload'], 'SNAPSHOT_INVENTORY_INVALID');
  const payload = join(snapshotPath, 'payload');
  await assertSafeDirectory(payload, rootRealPath);
  exactEntries(await readdir(payload), ['runtime.json', 'config', 'data'], 'SNAPSHOT_INVENTORY_INVALID');
  await assertSafeDirectory(join(payload, 'config'), rootRealPath);
  await assertSafeDirectory(join(payload, 'data'), rootRealPath);
  exactEntries(await readdir(join(payload, 'config')), ['household.json'], 'SNAPSHOT_INVENTORY_INVALID');


  const manifestPath = join(snapshotPath, 'snapshot.json');
  await assertSafeRegularFile(manifestPath, rootRealPath);
  let manifestValue: unknown;
  try {
    manifestValue = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
  } catch {
    throw new Error('SNAPSHOT_MANIFEST_INVALID');
  }
  const manifest = validateSnapshotManifest(manifestValue);
  if (manifest.snapshotId !== snapshotId) throw new Error('SNAPSHOT_ID_MISMATCH');

  const version = manifest.source.runtimeManifest.dataLayoutVersion;
  const files = runtimeSnapshotFiles(version);
  exactEntries(await readdir(join(payload, 'data')), files.filter(path => path.startsWith('data/')).map(path => path.slice(5)), 'SNAPSHOT_INVENTORY_INVALID');

  let totalBytes = 0;
  for (let index = 0; index < files.length; index += 1) {
    const relativePath = files[index];
    const filePath = join(payload, ...relativePath.split('/'));
    await assertSafeRegularFile(filePath, rootRealPath);
    const fileStats = await stat(filePath);
    const expected = manifest.files[index];
    if (fileStats.size !== expected.bytes) throw new Error('SNAPSHOT_SIZE_MISMATCH');
    if (await hash(filePath) !== expected.sha256) throw new Error('SNAPSHOT_CHECKSUM_MISMATCH');
    totalBytes += fileStats.size;
  }

  try {
    assertRuntimeManifest(JSON.parse(await readFile(join(payload, 'runtime.json'), 'utf8')) as unknown, version);
    (version === 2 ? (value: unknown) => validateHouseholdConfigV1(value, { allowUnresolvedReferences: true }) : validateHouseholdConfig)(JSON.parse(await readFile(join(payload, 'config', 'household.json'), 'utf8')) as unknown);
    await validateStoreSet(join(payload, 'data'), version);
    if (version === 3) await validateHouseholdScope(payload);
  } catch (error) {
    throw new Error('SNAPSHOT_PAYLOAD_INVALID', { cause: error });
  }
  return { snapshotId, fileCount: files.length, totalBytes, dataLayoutVersion: version };
}
