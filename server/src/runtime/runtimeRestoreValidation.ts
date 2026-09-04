import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises';

import { validateHouseholdConfig } from '../config/householdConfig.js';
import {
  RUNTIME_STORE_FILES,
  assertExternalRuntimePath,
  getAbsolutePathStyle,
  isPathWithin,
} from '../config/runtimeData.js';
import { RUNTIME_SNAPSHOT_FILES } from './runtimeSnapshotInventory.js';
import { assertRuntimeManifest, validateStoreSet } from './runtimeValidation.js';
import type { CurrentRuntimeState } from './runtimeRestoreJournal.js';

async function exists(path: string): Promise<boolean> {
  return Boolean(await lstat(path).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }));
}

export async function classifyCurrentRuntime(runtimeRoot: string): Promise<CurrentRuntimeState> {
  const root = assertExternalRuntimePath(runtimeRoot);
  const rootStats = await lstat(root).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  });
  if (!rootStats) return 'absent';
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) return 'invalid';
  const required = await Promise.all(RUNTIME_SNAPSHOT_FILES.map(relative =>
    exists(getAbsolutePathStyle(root)!.join(root, ...relative.split('/'))),
  ));
  if (required.some(value => !value)) return 'incomplete';
  try {
    await validateProductionRuntime(root);
    return 'valid';
  } catch { return 'invalid'; }
}

function exact(actual: string[], expected: string[]): void {
  const sort = (values: string[]) => [...values].sort((a, b) => a.localeCompare(b, 'en'));
  if (JSON.stringify(sort(actual)) !== JSON.stringify(sort(expected))) throw new Error('RESTORE_RUNTIME_INVENTORY_INVALID');
}

export async function validateRestoredRuntime(runtimeRoot: string): Promise<void> {
  await validateRuntime(runtimeRoot, false);
}

export async function validateProductionRuntime(runtimeRoot: string): Promise<void> {
  await validateRuntime(runtimeRoot, true);
}

async function validateRuntime(runtimeRoot: string, allowStoreBackups: boolean): Promise<void> {
  const root = assertExternalRuntimePath(runtimeRoot);
  const style = getAbsolutePathStyle(root)!;
  const stats = await lstat(root);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('RESTORE_RUNTIME_UNSAFE');
  const real = await realpath(root);
  exact(await readdir(root), ['runtime.json', 'config', 'data']);
  exact(await readdir(style.join(root, 'config')), ['household.json']);
  const expectedDataFiles = [...RUNTIME_STORE_FILES];
  const actualDataFiles = await readdir(style.join(root, 'data'));
  if (allowStoreBackups) {
    const allowedDataFiles = new Set([
      ...expectedDataFiles,
      ...expectedDataFiles.map(file => `${file}.bak`),
    ]);
    if (actualDataFiles.some(file => !allowedDataFiles.has(file))) {
      throw new Error('RESTORE_RUNTIME_INVENTORY_INVALID');
    }
    for (const expected of expectedDataFiles) {
      if (!actualDataFiles.includes(expected)) throw new Error('RESTORE_RUNTIME_INVENTORY_INVALID');
    }
  } else {
    exact(actualDataFiles, expectedDataFiles);
  }
  for (const directory of ['config', 'data']) {
    const path = style.join(root, directory);
    const value = await lstat(path);
    if (!value.isDirectory() || value.isSymbolicLink() || !isPathWithin(real, await realpath(path))) {
      throw new Error('RESTORE_RUNTIME_UNSAFE');
    }
  }
  for (const relative of RUNTIME_SNAPSHOT_FILES) {
    const path = style.join(root, ...relative.split('/'));
    const value = await lstat(path);
    if (!value.isFile() || value.isSymbolicLink() || !isPathWithin(real, await realpath(path))) {
      throw new Error('RESTORE_RUNTIME_UNSAFE');
    }
  }
  if (allowStoreBackups) {
    for (const file of actualDataFiles.filter(file => file.endsWith('.bak'))) {
      const path = style.join(root, 'data', file);
      const value = await lstat(path);
      if (!value.isFile() || value.isSymbolicLink() || !isPathWithin(real, await realpath(path))) {
        throw new Error('RESTORE_RUNTIME_UNSAFE');
      }
    }
  }
  assertRuntimeManifest(JSON.parse(await readFile(style.join(root, 'runtime.json'), 'utf8')) as unknown);
  validateHouseholdConfig(JSON.parse(await readFile(style.join(root, 'config', 'household.json'), 'utf8')) as unknown);
  await validateStoreSet(style.join(root, 'data'));
}

export async function runtimeMatchesSnapshot(runtimeRoot: string, snapshotPath: string): Promise<void> {
  const style = getAbsolutePathStyle(runtimeRoot)!;
  for (const relative of RUNTIME_SNAPSHOT_FILES) {
    const [runtimeBytes, snapshotBytes] = await Promise.all([
      readFile(style.join(runtimeRoot, ...relative.split('/'))),
      readFile(style.join(snapshotPath, 'payload', ...relative.split('/'))),
    ]);
    const runtimeHash = createHash('sha256').update(runtimeBytes).digest('hex');
    const snapshotHash = createHash('sha256').update(snapshotBytes).digest('hex');
    if (runtimeBytes.length !== snapshotBytes.length || runtimeHash !== snapshotHash) {
      throw new Error('RESTORE_CHECKSUM_MISMATCH');
    }
  }
}

export async function estimateRuntimeBytes(path: string): Promise<number> {
  const style = getAbsolutePathStyle(path)!;
  let total = 0;
  for (const relative of RUNTIME_SNAPSHOT_FILES) total += (await stat(style.join(path, 'payload', ...relative.split('/')))).size;
  return total;
}
