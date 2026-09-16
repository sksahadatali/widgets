import { randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises';
import {
  assertExternalRuntimePath,
  getAbsolutePathStyle,
} from '../config/runtimeData.js';
import { readRuntimeRestoreJournal } from './runtimeRestoreJournal.js';
import { isSystemProcessIdentity } from './systemProcessIdentity.js';

export type RuntimeOperation = 'server' | 'snapshot' | 'restore';

export type RuntimeOperationOwner = {
  schemaVersion: 1 | 2 | 3;
  kind: 'eyos-runtime-operation-lock';
  operationId: string;
  operation: RuntimeOperation;
  pid: number;
  createdAt: string;
  bootId?: string;
  processIdentity?: string;
};

export type RuntimeOperationLock = {
  lockPath: string;
  owner: RuntimeOperationOwner;
};

function isBootIdentity(value: string): boolean {
  return /^(?:win32:[0-9]{10,}|linux:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(value);
}

function exactOwner(value: unknown): RuntimeOperationOwner {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The runtime operation lock owner is invalid.');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    (
      record.schemaVersion === 1
        ? keys.length !== 6 || 'bootId' in record || 'processIdentity' in record
        : record.schemaVersion === 2
          ? keys.length !== 7 || 'processIdentity' in record ||
            typeof record.bootId !== 'string' || !isBootIdentity(record.bootId)
          : keys.length !== 8 || typeof record.bootId !== 'string' ||
            !isBootIdentity(record.bootId) ||
            typeof record.processIdentity !== 'string' ||
            !isSystemProcessIdentity(record.processIdentity)
    ) ||
    keys.some(key => ![
      'schemaVersion', 'kind', 'operationId', 'operation', 'pid', 'createdAt', 'bootId', 'processIdentity',
    ].includes(key)) ||
    ![1, 2, 3].includes(Number(record.schemaVersion)) ||
    record.kind !== 'eyos-runtime-operation-lock' ||
    typeof record.operationId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.operationId) ||
    !['server', 'snapshot', 'restore'].includes(String(record.operation)) ||
    !Number.isInteger(record.pid) || Number(record.pid) <= 0 ||
    typeof record.createdAt !== 'string' ||
    Number.isNaN(Date.parse(record.createdAt))
  ) {
    throw new Error('The runtime operation lock owner is invalid.');
  }
  return record as RuntimeOperationOwner;
}

export function getRuntimeOperationLockPath(runtimeRoot: string): string {
  const normalized = assertExternalRuntimePath(runtimeRoot);
  const style = getAbsolutePathStyle(normalized);
  if (!style) throw new Error('Runtime root must be an absolute local path.');
  return style.join(
    style.dirname(normalized),
    `.${style.basename(normalized)}.operation-lock`,
  );
}

export async function acquireRuntimeOperationLock(options: {
  runtimeRoot: string;
  operation: RuntimeOperation;
  bootId?: string | null;
  processIdentity?: string | null;
}): Promise<RuntimeOperationLock> {
  const runtimeRoot = assertExternalRuntimePath(options.runtimeRoot);
  const style = getAbsolutePathStyle(runtimeRoot)!;
  const parent = style.dirname(runtimeRoot);
  assertExternalRuntimePath(await realpath(parent));
  const lockPath = getRuntimeOperationLockPath(runtimeRoot);
  const bootId = options.bootId?.trim();
  if (bootId && !isBootIdentity(bootId)) {
    throw new Error('Runtime operation boot identity is invalid.');
  }
  const processIdentity = options.processIdentity?.trim();
  if (processIdentity && !isSystemProcessIdentity(processIdentity)) {
    throw new Error('Runtime operation process identity is invalid.');
  }
  if (processIdentity && !bootId) {
    throw new Error('Runtime operation process identity requires a boot identity.');
  }
  const owner: RuntimeOperationOwner = {
    schemaVersion: processIdentity ? 3 : bootId ? 2 : 1,
    kind: 'eyos-runtime-operation-lock',
    operationId: randomUUID(),
    operation: options.operation,
    pid: process.pid,
    createdAt: new Date().toISOString(),
    ...(bootId ? { bootId } : {}),
    ...(processIdentity ? { processIdentity } : {}),
  };
  try {
    await mkdir(lockPath, { recursive: false, mode: 0o700 });
  } catch (error) {
    throw new Error('The external runtime is locked by another operation.', { cause: error });
  }
  try {
    await writeFile(
      getOwnerPath(lockPath),
      `${JSON.stringify(owner, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
    return { lockPath, owner };
  } catch (error) {
    // Preserve an ownerless lock: its existence still protects the runtime.
    throw new Error('The runtime operation lock owner could not be recorded.', { cause: error });
  }
}

function getOwnerPath(lockPath: string): string {
  const style = getAbsolutePathStyle(lockPath);
  if (!style) throw new Error('Runtime lock path is invalid.');
  return style.join(lockPath, 'owner.json');
}

export async function inspectRuntimeOperationLock(
  runtimeRoot: string,
): Promise<{ lockPath: string; owner: RuntimeOperationOwner | null; orphaned: boolean } | null> {
  const lockPath = getRuntimeOperationLockPath(runtimeRoot);
  let stats;
  try {
    stats = await lstat(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error('The runtime operation lock path is unsafe.');
  }
  try {
    const entries = await readdir(lockPath);
    if (entries.length !== 1 || entries[0] !== 'owner.json') throw new Error('unsafe');
    const ownerStats = await lstat(getOwnerPath(lockPath));
    if (!ownerStats.isFile() || ownerStats.isSymbolicLink()) throw new Error('unsafe');
    const owner = exactOwner(JSON.parse(await readFile(getOwnerPath(lockPath), 'utf8')) as unknown);
    return { lockPath, owner, orphaned: false };
  } catch {
    return { lockPath, owner: null, orphaned: true };
  }
}

export async function releaseRuntimeOperationLock(
  lock: RuntimeOperationLock,
): Promise<void> {
  const style = getAbsolutePathStyle(lock.lockPath)!;
  const runtimeName = style.basename(lock.lockPath).replace(/^\./, '').replace(/\.operation-lock$/, '');
  const runtimeRoot = style.join(style.dirname(lock.lockPath), runtimeName);
  const current = await inspectRuntimeOperationLock(runtimeRoot);
  if (
    !current?.owner ||
    current.lockPath !== lock.lockPath ||
    current.owner.operationId !== lock.owner.operationId ||
    current.owner.operation !== lock.owner.operation
  ) {
    throw new Error('The runtime operation lock ownership no longer matches.');
  }
  await rm(getOwnerPath(lock.lockPath));
  await rmdir(lock.lockPath);
}

export async function clearRuntimeOperationLock(options: {
  runtimeRoot: string;
  operationId?: string;
  confirmClear?: boolean;
  confirmOrphaned?: boolean;
}): Promise<'cleared' | 'absent'> {
  const inspected = await inspectRuntimeOperationLock(options.runtimeRoot);
  if (!inspected) return 'absent';
  if (inspected.owner?.operation === 'restore' || await readRuntimeRestoreJournal(options.runtimeRoot)) {
    throw new Error('A restore lock must be resolved with runtime:restore:recover.');
  }
  if (inspected.orphaned) {
    if (!options.confirmOrphaned) {
      throw new Error('The orphaned runtime lock requires --confirm-orphaned-lock.');
    }
  } else if (
    !options.confirmClear ||
    options.operationId !== inspected.owner?.operationId
  ) {
    throw new Error('Clearing the runtime lock requires its exact operation ID and --confirm-clear.');
  }
  await rm(inspected.lockPath, { recursive: true, force: false });
  return 'cleared';
}
