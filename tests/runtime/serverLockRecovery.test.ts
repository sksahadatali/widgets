import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterEach,
  describe,
  it,
} from 'node:test';

import {
  acquireRuntimeOperationLock,
  getRuntimeOperationLockPath,
  inspectRuntimeOperationLock,
  releaseRuntimeOperationLock,
} from '../../server/src/runtime/runtimeOperationLock.js';
import {
  recoverServerLockFromPreviousBoot,
} from '../../server/src/runtime/serverLockRecovery.js';
import {
  parseWindowsBootTicks,
  getWindowsPowerShellPath,
  readSystemBootIdentity,
} from '../../server/src/runtime/systemBootIdentity.js';
import {
  parseLinuxProcessStat,
  parseWindowsProcessTicks,
  readSystemProcessIdentity,
} from '../../server/src/runtime/systemProcessIdentity.js';

const temporaryPaths: string[] = [];
const previousBoot = 'win32:638925120000000000';
const currentBoot = 'win32:638926848000000000';
const previousProcess = 'win32:638926848010000000';
const replacementProcess = 'win32:638926848020000000';

async function fixture(): Promise<{
  runtimeRoot: string;
  backupRoot: string;
}> {
  const parent = await mkdtemp(
    join(tmpdir(), 'eyos-server-lock-recovery-'),
  );
  temporaryPaths.push(parent);
  const runtimeRoot = join(parent, 'runtime');
  const backupRoot = join(parent, 'backups');
  await Promise.all([
    mkdir(runtimeRoot),
    mkdir(backupRoot),
  ]);
  return { runtimeRoot, backupRoot };
}

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map(path =>
      rm(path, { recursive: true, force: true })
    ),
  );
});

describe('system boot identity', () => {
  it('parses a stable Windows boot timestamp without using PID state', () => {
    assert.equal(
      parseWindowsBootTicks('638925120000000000\r\n'),
      previousBoot,
    );
    assert.throws(
      () => parseWindowsBootTicks('not-a-boot-time'),
      /boot identity is invalid/,
    );
  });

  it('resolves Windows PowerShell from the trusted system root', () => {
    assert.equal(
      getWindowsPowerShellPath({ SystemRoot: 'C:\\Windows' }),
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    );
    assert.throws(
      () => getWindowsPowerShellPath({ SystemRoot: 'relative' }),
      /SystemRoot is unavailable or invalid/,
    );
  });

  it('reads the current Linux kernel boot identity where supported', async () => {
    if (process.platform !== 'linux') return;
    assert.match(
      await readSystemBootIdentity(),
      /^linux:[0-9a-f-]{36}$/,
    );
  });

  it('refuses to create lock evidence with an unverified boot identity', async () => {
    const { runtimeRoot } = await fixture();
    await assert.rejects(
      () => acquireRuntimeOperationLock({
        runtimeRoot,
        operation: 'server',
        bootId: 'windows:unknown',
      }),
      /boot identity is invalid/,
    );
    assert.equal(await inspectRuntimeOperationLock(runtimeRoot), null);
  });
});

describe('system process identity', () => {
  it('parses Windows process creation ticks and an absent process', () => {
    assert.equal(
      parseWindowsProcessTicks('638926848010000000\r\n'),
      previousProcess,
    );
    assert.equal(parseWindowsProcessTicks('absent'), null);
    assert.throws(
      () => parseWindowsProcessTicks('Access denied'),
      /process identity is invalid/,
    );
  });

  it('parses Linux start time even when the command contains spaces', () => {
    const prefix = '123 (node household service) S';
    const fields = Array.from({ length: 19 }, (_, index) => String(index + 4));
    fields[18] = '987654';
    assert.equal(
      parseLinuxProcessStat(`${prefix} ${fields.join(' ')}`),
      'linux:987654',
    );
  });

  it('reads the current process identity where supported', async () => {
    if (!['linux', 'win32'].includes(process.platform)) return;
    assert.match(
      await readSystemProcessIdentity(process.pid) ?? '',
      /^(?:linux:[0-9]+|win32:[0-9]{10,})$/,
    );
  });
});

describe('previous-boot server lock recovery', () => {
  it('recovers only a server lock proven to belong to a different boot and audits it', async () => {
    const { runtimeRoot, backupRoot } = await fixture();
    const lock = await acquireRuntimeOperationLock({
      runtimeRoot,
      operation: 'server',
      bootId: previousBoot,
    });

    assert.equal(
      await recoverServerLockFromPreviousBoot({
        runtimeRoot,
        backupRoot,
        currentBootId: currentBoot,
      }),
      'recovered',
    );
    assert.equal(await inspectRuntimeOperationLock(runtimeRoot), null);

    const records = (
      await readFile(join(backupRoot, 'operations.jsonl'), 'utf8')
    ).trim().split('\n').map(line => JSON.parse(line) as {
      operationId: string;
      operation: string;
      status: string;
      recoveredOperationId: string;
      recoveryReason: string;
    });
    assert.equal(records.length, 2);
    assert.equal(records[0].operation, 'server-lock-recovery');
    assert.equal(records[0].status, 'started');
    assert.equal(records[1].status, 'succeeded');
    assert.equal(records[1].operationId, records[0].operationId);
    assert.equal(
      records[0].recoveredOperationId,
      lock.owner.operationId,
    );
    assert.equal(records[1].recoveredOperationId, lock.owner.operationId);
    assert.equal(records[0].recoveryReason, 'previous-boot');
    assert.equal(records[1].recoveryReason, 'previous-boot');
    for (const record of records) {
      assert.equal('pid' in record, false);
      assert.equal('bootId' in record, false);
      assert.equal('runtimeRoot' in record, false);
      assert.equal('backupRoot' in record, false);
    }
  });

  it('retains a same-boot server lock even when its PID cannot establish ownership', async () => {
    const { runtimeRoot, backupRoot } = await fixture();
    const lock = await acquireRuntimeOperationLock({
      runtimeRoot,
      operation: 'server',
      bootId: currentBoot,
    });

    assert.equal(
      await recoverServerLockFromPreviousBoot({
        runtimeRoot,
        backupRoot,
        currentBootId: currentBoot,
      }),
      'retained',
    );
    assert.equal(
      (await inspectRuntimeOperationLock(runtimeRoot))?.owner?.operationId,
      lock.owner.operationId,
    );
    await releaseRuntimeOperationLock(lock);
  });

  it('recovers a same-boot server lock only when its exact process instance is gone', async () => {
    const { runtimeRoot, backupRoot } = await fixture();
    const lock = await acquireRuntimeOperationLock({
      runtimeRoot,
      operation: 'server',
      bootId: currentBoot,
      processIdentity: previousProcess,
    });

    assert.equal(
      await recoverServerLockFromPreviousBoot(
        { runtimeRoot, backupRoot, currentBootId: currentBoot },
        { readProcessIdentity: async () => null },
      ),
      'recovered',
    );
    assert.equal(await inspectRuntimeOperationLock(runtimeRoot), null);
    const records = (await readFile(
      join(backupRoot, 'operations.jsonl'),
      'utf8',
    )).trim().split('\n').map(line => JSON.parse(line) as {
      recoveryReason: string;
      recoveredOperationId: string;
    });
    assert.equal(records[0].recoveryReason, 'same-boot-process-ended');
    assert.equal(records[0].recoveredOperationId, lock.owner.operationId);
  });

  it('retains a same-boot lock while the exact owner process is live', async () => {
    const { runtimeRoot, backupRoot } = await fixture();
    const lock = await acquireRuntimeOperationLock({
      runtimeRoot,
      operation: 'server',
      bootId: currentBoot,
      processIdentity: previousProcess,
    });

    assert.equal(
      await recoverServerLockFromPreviousBoot(
        { runtimeRoot, backupRoot, currentBootId: currentBoot },
        { readProcessIdentity: async () => previousProcess },
      ),
      'retained',
    );
    assert.equal(
      (await inspectRuntimeOperationLock(runtimeRoot))?.owner?.operationId,
      lock.owner.operationId,
    );
    await releaseRuntimeOperationLock(lock);
  });

  it('handles PID reuse without treating the replacement process as the lock owner', async () => {
    const { runtimeRoot, backupRoot } = await fixture();
    await acquireRuntimeOperationLock({
      runtimeRoot,
      operation: 'server',
      bootId: currentBoot,
      processIdentity: previousProcess,
    });

    assert.equal(
      await recoverServerLockFromPreviousBoot(
        { runtimeRoot, backupRoot, currentBootId: currentBoot },
        { readProcessIdentity: async () => replacementProcess },
      ),
      'recovered',
    );
    assert.equal(await inspectRuntimeOperationLock(runtimeRoot), null);
  });

  it('fails closed when same-boot process ownership cannot be inspected', async () => {
    const { runtimeRoot, backupRoot } = await fixture();
    const lock = await acquireRuntimeOperationLock({
      runtimeRoot,
      operation: 'server',
      bootId: currentBoot,
      processIdentity: previousProcess,
    });
    const inspectionError = new Error('synthetic process inspection failure');

    await assert.rejects(
      () => recoverServerLockFromPreviousBoot(
        { runtimeRoot, backupRoot, currentBootId: currentBoot },
        { readProcessIdentity: async () => { throw inspectionError; } },
      ),
      error => error === inspectionError,
    );
    assert.equal(
      (await inspectRuntimeOperationLock(runtimeRoot))?.owner?.operationId,
      lock.owner.operationId,
    );
    await releaseRuntimeOperationLock(lock);
  });

  for (const operation of ['snapshot', 'restore'] as const) {
    it(`never automatically recovers a previous-boot ${operation} lock`, async () => {
      const { runtimeRoot, backupRoot } = await fixture();
      const lock = await acquireRuntimeOperationLock({
        runtimeRoot,
        operation,
        bootId: previousBoot,
      });
      assert.equal(
        await recoverServerLockFromPreviousBoot({
          runtimeRoot,
          backupRoot,
          currentBootId: currentBoot,
        }),
        'retained',
      );
      await releaseRuntimeOperationLock(lock);
    });
  }

  it('retains a server lock whenever restore-state evidence exists', async () => {
    const { runtimeRoot, backupRoot } = await fixture();
    const lock = await acquireRuntimeOperationLock({
      runtimeRoot,
      operation: 'server',
      bootId: previousBoot,
    });
    assert.equal(
      await recoverServerLockFromPreviousBoot(
        {
          runtimeRoot,
          backupRoot,
          currentBootId: currentBoot,
        },
        {
          readRestoreJournal: async () => ({ evidence: true }) as never,
        },
      ),
      'retained',
    );
    await releaseRuntimeOperationLock(lock);
  });

  it('retains legacy, ownerless, malformed, and unsafe lock evidence', async () => {
    for (const ownerContent of [
      null,
      '{bad',
      JSON.stringify({
        schemaVersion: 1,
        kind: 'eyos-runtime-operation-lock',
        operationId: '00000000-0000-4000-8000-000000000001',
        operation: 'server',
        pid: 999999,
        createdAt: '2026-09-01T00:00:00.000Z',
      }),
    ]) {
      const { runtimeRoot, backupRoot } = await fixture();
      const lockPath = getRuntimeOperationLockPath(runtimeRoot);
      await mkdir(lockPath);
      if (ownerContent !== null) {
        await writeFile(join(lockPath, 'owner.json'), ownerContent);
      }
      assert.equal(
        await recoverServerLockFromPreviousBoot({
          runtimeRoot,
          backupRoot,
          currentBootId: currentBoot,
        }),
        'retained',
      );
      assert.notEqual(await inspectRuntimeOperationLock(runtimeRoot), null);
    }
  });

  it('requires an existing audit root before changing a provably stale lock', async () => {
    const { runtimeRoot } = await fixture();
    const lock = await acquireRuntimeOperationLock({
      runtimeRoot,
      operation: 'server',
      bootId: previousBoot,
    });
    await assert.rejects(
      () => recoverServerLockFromPreviousBoot({
        runtimeRoot,
        currentBootId: currentBoot,
      }),
      /EYOS_BACKUP_ROOT is required/,
    );
    assert.equal(
      (await inspectRuntimeOperationLock(runtimeRoot))?.owner?.operationId,
      lock.owner.operationId,
    );
    await releaseRuntimeOperationLock(lock);
  });

  it('retains the lock when a current boot identity cannot be established', async () => {
    const { runtimeRoot, backupRoot } = await fixture();
    const lock = await acquireRuntimeOperationLock({
      runtimeRoot,
      operation: 'server',
      bootId: previousBoot,
    });
    assert.equal(
      await recoverServerLockFromPreviousBoot(
        { runtimeRoot, backupRoot },
        { readBootIdentity: async () => null },
      ),
      'retained',
    );
    assert.equal(
      (await inspectRuntimeOperationLock(runtimeRoot))?.owner?.operationId,
      lock.owner.operationId,
    );
    await releaseRuntimeOperationLock(lock);
  });

  it('rejects an audit root nested with the runtime and retains the lock', async () => {
    const { runtimeRoot } = await fixture();
    const nestedBackupRoot = join(runtimeRoot, 'backups');
    await mkdir(nestedBackupRoot);
    const lock = await acquireRuntimeOperationLock({
      runtimeRoot,
      operation: 'server',
      bootId: previousBoot,
    });
    await assert.rejects(
      () => recoverServerLockFromPreviousBoot({
        runtimeRoot,
        backupRoot: nestedBackupRoot,
        currentBootId: currentBoot,
      }),
      /must not contain one another/,
    );
    assert.equal(
      (await inspectRuntimeOperationLock(runtimeRoot))?.owner?.operationId,
      lock.owner.operationId,
    );
    await releaseRuntimeOperationLock(lock);
  });

  it('does not change the lock when the recovery-intent audit fails', async () => {
    const { runtimeRoot, backupRoot } = await fixture();
    const lock = await acquireRuntimeOperationLock({
      runtimeRoot,
      operation: 'server',
      bootId: previousBoot,
    });
    const auditFailure = new Error('synthetic audit failure');
    await assert.rejects(
      () => recoverServerLockFromPreviousBoot(
        { runtimeRoot, backupRoot, currentBootId: currentBoot },
        { appendAudit: async () => { throw auditFailure; } },
      ),
      error => error === auditFailure,
    );
    assert.equal(
      (await inspectRuntimeOperationLock(runtimeRoot))?.owner?.operationId,
      lock.owner.operationId,
    );
    await releaseRuntimeOperationLock(lock);
  });

  it('retains an audit intent if only completion auditing degrades', async () => {
    const { runtimeRoot, backupRoot } = await fixture();
    await acquireRuntimeOperationLock({
      runtimeRoot,
      operation: 'server',
      bootId: previousBoot,
    });
    const statuses: string[] = [];
    const warnings: string[] = [];
    assert.equal(
      await recoverServerLockFromPreviousBoot(
        { runtimeRoot, backupRoot, currentBootId: currentBoot },
        {
          appendAudit: async (_root, record) => {
            statuses.push(record.status);
            if (record.status === 'succeeded') {
              throw new Error('synthetic completion audit failure');
            }
          },
          reportWarning: message => warnings.push(message),
        },
      ),
      'recovered',
    );
    assert.deepEqual(statuses, ['started', 'succeeded']);
    assert.equal(await inspectRuntimeOperationLock(runtimeRoot), null);

    assert.deepEqual(warnings, [
      'WARNING: The stale server lock was safely recovered, but its completion audit could not be appended.',
    ]);
    assert.equal(warnings[0].includes(runtimeRoot), false);
    assert.equal(warnings[0].includes(backupRoot), false);
  });

  it('fails closed and audits failure when owned lock release fails', async () => {
    const { runtimeRoot, backupRoot } = await fixture();
    const lock = await acquireRuntimeOperationLock({
      runtimeRoot,
      operation: 'server',
      bootId: previousBoot,
    });
    await assert.rejects(
      () => recoverServerLockFromPreviousBoot(
        { runtimeRoot, backupRoot, currentBootId: currentBoot },
        { releaseLock: async () => { throw new Error('synthetic release failure'); } },
      ),
      /could not be released/,
    );
    assert.equal(
      (await inspectRuntimeOperationLock(runtimeRoot))?.owner?.operationId,
      lock.owner.operationId,
    );
    const audit = await readFile(
      join(backupRoot, 'operations.jsonl'),
      'utf8',
    );
    assert.match(audit, /"status":"started"/);
    assert.match(audit, /"status":"failed"/);
    assert.match(audit, /SERVER_LOCK_RELEASE_FAILED/);
    await releaseRuntimeOperationLock(lock);
  });
});
