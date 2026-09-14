import { randomUUID } from 'node:crypto';
import {
  lstat,
  realpath,
} from 'node:fs/promises';

import {
  assertExternalPath,
  isPathWithin,
} from '../config/runtimeData.js';
import {
  appendSnapshotAudit,
} from './runtimeSnapshotAudit.js';
import {
  inspectRuntimeOperationLock,
  releaseRuntimeOperationLock,
} from './runtimeOperationLock.js';
import {
  readRuntimeRestoreJournal,
} from './runtimeRestoreJournal.js';
import {
  readSystemBootIdentity,
} from './systemBootIdentity.js';

type RecoveryResult =
  | 'absent'
  | 'recovered'
  | 'retained';

interface RecoveryDependencies {
  inspectLock?: typeof inspectRuntimeOperationLock;
  readRestoreJournal?: typeof readRuntimeRestoreJournal;
  readBootIdentity?: typeof readSystemBootIdentity;
  releaseLock?: typeof releaseRuntimeOperationLock;
  appendAudit?: typeof appendSnapshotAudit;
  now?: () => string;
  reportWarning?: (message: string) => void;
}

async function validateAuditRoot(
  value: string,
  runtimeRootValue: string,
): Promise<string> {
  const root = assertExternalPath(value, 'EYOS_BACKUP_ROOT');
  const stats = await lstat(root).catch(() => null);
  if (!stats?.isDirectory() || stats.isSymbolicLink()) {
    throw new Error('EYOS_BACKUP_ROOT must be an existing safe directory.');
  }
  const resolvedRoot = assertExternalPath(
    await realpath(root),
    'EYOS_BACKUP_ROOT',
  );
  const resolvedRuntime = assertExternalPath(
    await realpath(runtimeRootValue),
    'EYOS_RUNTIME_DIR',
  );
  if (
    isPathWithin(resolvedRuntime, resolvedRoot) ||
    isPathWithin(resolvedRoot, resolvedRuntime)
  ) {
    throw new Error(
      'Runtime and backup roots must not contain one another.',
    );
  }
  return resolvedRoot;
}

export async function recoverServerLockFromPreviousBoot(options: {
  runtimeRoot: string;
  backupRoot?: string;
  currentBootId?: string | null;
}, dependencies: RecoveryDependencies = {}): Promise<RecoveryResult> {
  const inspectLock =
    dependencies.inspectLock ?? inspectRuntimeOperationLock;
  const inspected = await inspectLock(options.runtimeRoot);
  if (!inspected) return 'absent';

  const owner = inspected.owner;
  if (
    inspected.orphaned ||
    !owner ||
    owner.operation !== 'server' ||
    owner.schemaVersion !== 2 ||
    !owner.bootId
  ) {
    return 'retained';
  }

  const readRestoreJournal =
    dependencies.readRestoreJournal ?? readRuntimeRestoreJournal;
  if (await readRestoreJournal(options.runtimeRoot)) {
    return 'retained';
  }

  const readBootIdentity =
    dependencies.readBootIdentity ?? readSystemBootIdentity;
  const currentBootId =
    options.currentBootId ?? await readBootIdentity();
  if (!currentBootId || currentBootId === owner.bootId) {
    return 'retained';
  }

  if (!options.backupRoot?.trim()) {
    throw new Error(
      'EYOS_BACKUP_ROOT is required to audit safe server-lock recovery.',
    );
  }
  const backupRoot = await validateAuditRoot(
    options.backupRoot,
    options.runtimeRoot,
  );
  const appendAudit =
    dependencies.appendAudit ?? appendSnapshotAudit;
  const releaseLock =
    dependencies.releaseLock ?? releaseRuntimeOperationLock;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const recoveryId = randomUUID();
  const startedAt = now();

  await appendAudit(backupRoot, {
    schemaVersion: 1,
    kind: 'eyos-snapshot-operation',
    operationId: recoveryId,
    operation: 'server-lock-recovery',
    recoveredOperationId: owner.operationId,
    startedAt,
    finishedAt: startedAt,
    status: 'started',
  });

  try {
    await releaseLock({
      lockPath: inspected.lockPath,
      owner,
    });
  } catch (error) {
    await appendAudit(backupRoot, {
      schemaVersion: 1,
      kind: 'eyos-snapshot-operation',
      operationId: recoveryId,
      operation: 'server-lock-recovery',
      recoveredOperationId: owner.operationId,
      startedAt,
      finishedAt: now(),
      status: 'failed',
      errorCode: 'SERVER_LOCK_RELEASE_FAILED',
    }).catch(() => undefined);
    throw new Error(
      'The stale server operation lock could not be released.',
      { cause: error },
    );
  }

  await appendAudit(backupRoot, {
    schemaVersion: 1,
    kind: 'eyos-snapshot-operation',
    operationId: recoveryId,
    operation: 'server-lock-recovery',
    recoveredOperationId: owner.operationId,
    startedAt,
    finishedAt: now(),
    status: 'succeeded',
  }).catch(() => {
    const reportWarning = dependencies.reportWarning ?? console.warn;
    reportWarning(
      'WARNING: The previous-boot server lock was safely recovered, but its completion audit could not be appended.',
    );
  });

  return 'recovered';
}
