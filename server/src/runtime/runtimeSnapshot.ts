import { createHash, randomUUID } from 'node:crypto';
import {
  access,
  copyFile,
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

import {
  HOUSEHOLD_CONFIG_FILE,
  RUNTIME_CONFIG_DIRECTORY,
  validateHouseholdConfig,
} from '../config/householdConfig.js';
import {
  EXPECTED_RUNTIME_MANIFEST,
  assertExternalPath,
  assertExternalRuntimePath,
  getAbsolutePathStyle,
  isPathWithin,
} from '../config/runtimeData.js';
import { preflightRuntimeData } from './runtimeValidation.js';
import {
  acquireRuntimeOperationLock,
  releaseRuntimeOperationLock,
  type RuntimeOperationLock,
} from './runtimeOperationLock.js';
import { appendSnapshotAudit } from './runtimeSnapshotAudit.js';
import { RUNTIME_SNAPSHOT_FILES } from './runtimeSnapshotInventory.js';
import {
  createSnapshotId,
  type RuntimeSnapshotManifest,
} from './runtimeSnapshotManifest.js';
import { verifyRuntimeSnapshot } from './runtimeSnapshotValidation.js';

export type SnapshotCreationResult = {
  snapshotId: string;
  snapshotPath: string;
  fileCount: 8;
  totalBytes: number;
  audit: 'recorded' | 'degraded';
};

function errorCode(error: unknown): string {
  if (error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)) return error.message;
  return 'SNAPSHOT_CREATE_FAILED';
}

type SyncFileHandle = Pick<Awaited<ReturnType<typeof open>>, 'sync' | 'close'>;
type SyncFileOpener = (
  path: string,
  flags: 'r+',
) => Promise<SyncFileHandle>;

export async function flushCopiedFile(
  path: string,
  openFile: SyncFileOpener = open,
): Promise<void> {
  // Windows FlushFileBuffers requires a handle with write access. `r+` keeps
  // the copied file intact while providing the required non-truncating handle.
  const handle = await openFile(path, 'r+');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function flushDirectory(path: string): Promise<void> {
  try {
    const handle = await open(path, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
  } catch (error) {
    if (!['EISDIR', 'EINVAL', 'EPERM', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      throw error;
    }
  }
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function hash(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function assertNoLink(path: string): Promise<void> {
  const value = await lstat(path);
  if (!value.isFile() || value.isSymbolicLink()) throw new Error('SNAPSHOT_SOURCE_UNSAFE');
}

async function assertSourceInventorySafe(
  runtimeRoot: string,
  runtimeReal: string,
): Promise<void> {
  const rootStats = await lstat(runtimeRoot);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error('SNAPSHOT_SOURCE_UNSAFE');
  }
  for (const directory of ['config', 'data']) {
    const path = join(runtimeRoot, directory);
    const value = await lstat(path);
    if (!value.isDirectory() || value.isSymbolicLink() || !isPathWithin(runtimeReal, await realpath(path))) {
      throw new Error('SNAPSHOT_SOURCE_UNSAFE');
    }
  }
  for (const relativePath of RUNTIME_SNAPSHOT_FILES) {
    const path = join(runtimeRoot, ...relativePath.split('/'));
    await assertNoLink(path);
    if (!isPathWithin(runtimeReal, await realpath(path))) throw new Error('SNAPSHOT_SOURCE_UNSAFE');
  }
}

export async function createRuntimeSnapshot(options: {
  runtimeRoot: string;
  backupRoot: string;
  now?: Date;
  randomPart?: string;
  auditAppender?: typeof appendSnapshotAudit;
  fileFlusher?: typeof flushCopiedFile;
}): Promise<SnapshotCreationResult> {
  const startedAt = new Date().toISOString();
  const runtimeRoot = assertExternalRuntimePath(options.runtimeRoot);
  const backupRoot = assertExternalPath(options.backupRoot, 'Backup root');
  const runtimeStyle = getAbsolutePathStyle(runtimeRoot)!;
  const backupStyle = getAbsolutePathStyle(backupRoot)!;
  if (runtimeStyle !== backupStyle) throw new Error('Runtime and backup paths use incompatible path styles.');
  const runtimeReal = await realpath(runtimeRoot);
  const backupReal = await realpath(backupRoot).catch(() => {
    throw new Error('Backup root must already exist.');
  });
  if (isPathWithin(runtimeReal, backupReal) || isPathWithin(backupReal, runtimeReal)) {
    throw new Error('Runtime and backup roots must not contain one another.');
  }
  const backupStats = await lstat(backupRoot);
  if (!backupStats.isDirectory() || backupStats.isSymbolicLink()) throw new Error('Backup root is unsafe.');
  await access(backupRoot, constants.R_OK | constants.W_OK);

  const now = options.now ?? new Date();
  const randomPart = options.randomPart ?? randomUUID().replaceAll('-', '').slice(0, 8);
  const snapshotId = createSnapshotId(now, randomPart);
  const snapshotsPath = join(backupRoot, 'snapshots');
  const stagingPath = join(backupRoot, `.staging-${snapshotId}`);
  const finalPath = join(snapshotsPath, snapshotId);
  const operationId = randomUUID();
  let lock: RuntimeOperationLock | null = null;
  let published = false;

  try {
    lock = await acquireRuntimeOperationLock({ runtimeRoot, operation: 'snapshot' });
    await assertSourceInventorySafe(runtimeRoot, runtimeReal);
    const runtime = {
      appMode: 'household' as const,
      rootPath: runtimeRoot,
      dataPath: join(runtimeRoot, 'data'),
      policy: 'required' as const,
      external: true,
    };
    await preflightRuntimeData(runtime);
    validateHouseholdConfig(JSON.parse(
      await readFile(join(runtimeRoot, RUNTIME_CONFIG_DIRECTORY, HOUSEHOLD_CONFIG_FILE), 'utf8'),
    ) as unknown);
    if (await exists(finalPath)) throw new Error('SNAPSHOT_ALREADY_EXISTS');
    if (await exists(stagingPath)) throw new Error('SNAPSHOT_STAGING_EXISTS');
    if (await exists(snapshotsPath)) {
      const snapshotsStats = await lstat(snapshotsPath);
      if (!snapshotsStats.isDirectory() || snapshotsStats.isSymbolicLink()) {
        throw new Error('SNAPSHOT_REPOSITORY_UNSAFE');
      }
    } else {
      await mkdir(snapshotsPath, { recursive: false, mode: 0o700 });
    }
    await mkdir(stagingPath, { recursive: false, mode: 0o700 });
    await mkdir(join(stagingPath, 'payload'), { recursive: false, mode: 0o700 });
    await mkdir(join(stagingPath, 'payload', 'config'), { recursive: false, mode: 0o700 });
    await mkdir(join(stagingPath, 'payload', 'data'), { recursive: true, mode: 0o700 });

    const sourceMetadata = new Map<string, { size: number; mtimeMs: number }>();
    for (const relativePath of RUNTIME_SNAPSHOT_FILES) {
      const value = await stat(join(runtimeRoot, ...relativePath.split('/')));
      sourceMetadata.set(relativePath, { size: value.size, mtimeMs: value.mtimeMs });
    }
    const files: RuntimeSnapshotManifest['files'] = [];
    for (const relativePath of RUNTIME_SNAPSHOT_FILES) {
      const source = join(runtimeRoot, ...relativePath.split('/'));
      const target = join(stagingPath, 'payload', ...relativePath.split('/'));
      await assertNoLink(source);
      await copyFile(source, target, constants.COPYFILE_EXCL);
      await chmod(target, 0o600);
      await (options.fileFlusher ?? flushCopiedFile)(target);
      const targetStats = await stat(target);
      files.push({ path: relativePath, bytes: targetStats.size, sha256: await hash(target) });
    }
    for (const relativePath of RUNTIME_SNAPSHOT_FILES) {
      const after = await stat(join(runtimeRoot, ...relativePath.split('/')));
      const before = sourceMetadata.get(relativePath)!;
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
        throw new Error('SNAPSHOT_SOURCE_CHANGED');
      }
    }
    const manifest: RuntimeSnapshotManifest = {
      schemaVersion: 1,
      kind: 'eyos-runtime-snapshot',
      snapshotId,
      createdAt: now.toISOString(),
      source: {
        runtimeManifest: EXPECTED_RUNTIME_MANIFEST,
        householdConfigSchemaVersion: 1,
      },
      consistency: { mode: 'offline', operationLockHeld: true },
      files,
    };
    const manifestPath = join(stagingPath, 'snapshot.json');
    const handle = await open(manifestPath, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      await handle.sync();
    } finally { await handle.close(); }
    const stagedVerification = await verifyRuntimeSnapshot(stagingPath, snapshotId);
    void stagedVerification;
    await flushDirectory(join(stagingPath, 'payload', 'config'));
    await flushDirectory(join(stagingPath, 'payload', 'data'));
    await flushDirectory(join(stagingPath, 'payload'));
    await flushDirectory(stagingPath);
    await rename(stagingPath, finalPath);
    await flushDirectory(snapshotsPath);
    published = true;
    const verified = await verifyRuntimeSnapshot(finalPath);
    let audit: SnapshotCreationResult['audit'] = 'recorded';
    try {
      await (options.auditAppender ?? appendSnapshotAudit)(backupRoot, {
        schemaVersion: 1,
        kind: 'eyos-snapshot-operation',
        operationId,
        operation: 'create',
        snapshotId,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: 'succeeded',
        fileCount: verified.fileCount,
        totalBytes: verified.totalBytes,
      });
    } catch { audit = 'degraded'; }
    return {
      snapshotId,
      snapshotPath: finalPath,
      fileCount: verified.fileCount,
      totalBytes: verified.totalBytes,
      audit,
    };
  } catch (error) {
    if (!published) await rm(stagingPath, { recursive: true, force: true }).catch(() => undefined);
    if (!published) {
      await (options.auditAppender ?? appendSnapshotAudit)(backupRoot, {
        schemaVersion: 1,
        kind: 'eyos-snapshot-operation', operationId, operation: 'create',
        snapshotId, startedAt, finishedAt: new Date().toISOString(),
        status: 'failed', errorCode: errorCode(error),
      }).catch(() => undefined);
    }
    throw error;
  } finally {
    if (lock) await releaseRuntimeOperationLock(lock).catch(() => undefined);
  }
}

export async function listRuntimeSnapshots(backupRootValue: string): Promise<Array<{
  snapshotId: string;
  status: 'valid' | 'invalid';
  totalBytes?: number;
  errorCode?: string;
}>> {
  const backupRoot = assertExternalPath(backupRootValue, 'Backup root');
  const backupStats = await lstat(backupRoot);
  if (!backupStats.isDirectory() || backupStats.isSymbolicLink()) {
    throw new Error('Backup root is unsafe.');
  }
  const snapshotsPath = join(backupRoot, 'snapshots');
  const snapshotsStats = await lstat(snapshotsPath).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  });
  if (snapshotsStats && (!snapshotsStats.isDirectory() || snapshotsStats.isSymbolicLink())) {
    throw new Error('Snapshot repository is unsafe.');
  }
  const entries = await readdir(snapshotsPath, { withFileTypes: true }).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
  const results = [];
  for (const entry of entries) {
    try {
      const verified = await verifyRuntimeSnapshot(join(snapshotsPath, entry.name));
      results.push({ snapshotId: entry.name, status: 'valid' as const, totalBytes: verified.totalBytes });
    } catch (error) {
      results.push({ snapshotId: entry.name, status: 'invalid' as const, errorCode: errorCode(error) });
    }
  }
  return results.sort((a, b) => a.snapshotId.localeCompare(b.snapshotId, 'en'));
}
