import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, it } from 'node:test';

import {
  EXPECTED_RUNTIME_MANIFEST,
  RUNTIME_STORE_FILES,
  normalizeAbsolutePath,
} from '../../server/src/config/runtimeData.js';
import {
  acquireRuntimeOperationLock,
  clearRuntimeOperationLock,
  getRuntimeOperationLockPath,
  inspectRuntimeOperationLock,
  releaseRuntimeOperationLock,
} from '../../server/src/runtime/runtimeOperationLock.js';
import {
  createRuntimeSnapshot,
  flushCopiedFile,
  listRuntimeSnapshots,
} from '../../server/src/runtime/runtimeSnapshot.js';
import { verifyRuntimeSnapshot } from '../../server/src/runtime/runtimeSnapshotValidation.js';

const temporaryPaths: string[] = [];
const timestamp = '2026-09-02T00:00:00.000Z';
const stores: Record<string, unknown> = {
  'routines.local.json': { schemaVersion: 3, routines: [], occurrences: [] },
  'rewards.local.json': { schemaVersion: 1, transactions: [] },
  'redemptions.local.json': { schemaVersion: 1, catalogue: [], requests: [] },
  'lists.local.json': {
    schemaVersion: 1,
    lists: [{
      id: '00000000-0000-4000-8000-000000000001', systemKey: 'shopping', name: 'Shopping', active: true,
      items: [], createdAt: timestamp, updatedAt: timestamp,
    }],
  },
  'meals.local.json': { schemaVersion: 1, entries: [] },
  'kumon.local.json': { schemaVersion: 1, assignments: [] },
};

const config = {
  schemaVersion: 1,
  household: { displayName: 'Synthetic Household', members: [{ id: 'adult', displayName: 'Synthetic Adult', memberType: 'adult' }] },
  location: { name: 'Synthetic Place', latitude: 51, longitude: -0.1, timezone: 'Europe/London' },
  travel: { homeAddress: '1 Synthetic Road', leaveBufferMinutes: 10, destinations: [] },
  calendar: { endpoint: 'https://example.invalid/calendar', refreshMinutes: 15, sources: [], semanticRules: [] },
};

async function temporaryDirectory(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  temporaryPaths.push(path);
  return path;
}

async function runtimeFixture(): Promise<string> {
  const root = await temporaryDirectory('eyos-hs3-runtime-');
  await mkdir(join(root, 'data'));
  await mkdir(join(root, 'config'));
  await writeFile(join(root, 'runtime.json'), `${JSON.stringify(EXPECTED_RUNTIME_MANIFEST)}\n`);
  await writeFile(join(root, 'config', 'household.json'), `${JSON.stringify(config)}\n`);
  await Promise.all(RUNTIME_STORE_FILES.map(file =>
    writeFile(join(root, 'data', file), `${JSON.stringify(stores[file])}\n`),
  ));
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('HS3A runtime operation lock', () => {
  it('excludes concurrent server and snapshot ownership', async () => {
    const root = await runtimeFixture();
    const first = await acquireRuntimeOperationLock({ runtimeRoot: root, operation: 'server' });
    await assert.rejects(
      () => acquireRuntimeOperationLock({ runtimeRoot: root, operation: 'snapshot' }),
      /locked by another operation/,
    );
    const inspected = await inspectRuntimeOperationLock(root);
    assert.equal(inspected?.owner?.operationId, first.owner.operationId);
    await releaseRuntimeOperationLock(first);
    assert.equal(await inspectRuntimeOperationLock(root), null);
  });

  it('requires exact confirmation to clear a recorded or orphaned lock', async () => {
    const root = await runtimeFixture();
    const lock = await acquireRuntimeOperationLock({ runtimeRoot: root, operation: 'snapshot' });
    await assert.rejects(() => clearRuntimeOperationLock({ runtimeRoot: root }), /exact operation ID/);
    await assert.rejects(
      () => clearRuntimeOperationLock({ runtimeRoot: root, operationId: 'wrong', confirmClear: true }),
      /exact operation ID/,
    );
    assert.equal(await clearRuntimeOperationLock({
      runtimeRoot: root, operationId: lock.owner.operationId, confirmClear: true,
    }), 'cleared');
    await mkdir(getRuntimeOperationLockPath(root));
    await assert.rejects(() => clearRuntimeOperationLock({ runtimeRoot: root }), /confirm-orphaned-lock/);
    assert.equal(await clearRuntimeOperationLock({ runtimeRoot: root, confirmOrphaned: true }), 'cleared');
  });
});

describe('HS3A validated snapshots', () => {
  it('opens copied files with Windows-compatible writable non-truncating access', async () => {
    let openedPath = '';
    let openedFlags = '';
    let synced = false;
    let closed = false;
    await flushCopiedFile('synthetic-copied-file.json', async (path, flags) => {
      openedPath = path;
      openedFlags = flags;
      return {
        sync: async () => { synced = true; },
        close: async () => { closed = true; },
      };
    });
    assert.equal(openedPath, 'synthetic-copied-file.json');
    assert.equal(openedFlags, 'r+');
    assert.equal(synced, true);
    assert.equal(closed, true);
  });

  it('publishes and independently verifies the exact eight-file inventory', async () => {
    const runtimeRoot = await runtimeFixture();
    const backupRoot = await temporaryDirectory('eyos-hs3-backup-');
    await writeFile(join(runtimeRoot, 'data', 'rewards.local.json.bak'), 'private evidence');
    await writeFile(join(runtimeRoot, 'data', 'ignored.tmp'), 'temporary evidence');
    const before = await Promise.all([
      readFile(join(runtimeRoot, 'runtime.json')),
      ...RUNTIME_STORE_FILES.map(file => readFile(join(runtimeRoot, 'data', file))),
    ]);
    const result = await createRuntimeSnapshot({
      runtimeRoot, backupRoot,
      now: new Date('2026-09-02T14:30:15.123Z'), randomPart: 'a1b2c3d4',
    });
    assert.equal(result.snapshotId, '20260902T143015.123Z-a1b2c3d4');
    assert.equal(result.audit, 'recorded');
    assert.deepEqual(await readdir(join(result.snapshotPath, 'payload')), ['config', 'data', 'runtime.json']);
    assert.deepEqual((await readdir(join(result.snapshotPath, 'payload', 'data'))).sort(), [...RUNTIME_STORE_FILES].sort());
    const verified = await verifyRuntimeSnapshot(result.snapshotPath);
    assert.equal(verified.fileCount, 8);
    const after = await Promise.all([
      readFile(join(runtimeRoot, 'runtime.json')),
      ...RUNTIME_STORE_FILES.map(file => readFile(join(runtimeRoot, 'data', file))),
    ]);
    assert.deepEqual(after, before);
    assert.equal(await inspectRuntimeOperationLock(runtimeRoot), null);
    const audit = await readFile(join(backupRoot, 'operations.jsonl'), 'utf8');
    assert.doesNotMatch(audit, /Synthetic Household|Synthetic Road|example\.invalid/);
  });

  it('rejects corrupted, incomplete and extended snapshots', async () => {
    const runtimeRoot = await runtimeFixture();
    const backupRoot = await temporaryDirectory('eyos-hs3-backup-');
    const created = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    await writeFile(join(created.snapshotPath, 'payload', 'data', 'meals.local.json'), '{"changed":true}');
    await assert.rejects(() => verifyRuntimeSnapshot(created.snapshotPath), /SNAPSHOT_(SIZE|CHECKSUM)_MISMATCH/);
    await writeFile(join(created.snapshotPath, 'payload', 'unknown.json'), '{}');
    await assert.rejects(() => verifyRuntimeSnapshot(created.snapshotPath), /SNAPSHOT_INVENTORY_INVALID/);
    await rm(join(created.snapshotPath, 'payload', 'unknown.json'));
    await rm(join(created.snapshotPath, 'payload', 'data', 'meals.local.json'));
    await assert.rejects(() => verifyRuntimeSnapshot(created.snapshotPath), /SNAPSHOT_INVENTORY_INVALID/);
  });

  it('keeps a verified publication successful when audit append degrades', async () => {
    const runtimeRoot = await runtimeFixture();
    const backupRoot = await temporaryDirectory('eyos-hs3-backup-');
    const result = await createRuntimeSnapshot({
      runtimeRoot, backupRoot,
      auditAppender: async () => { throw new Error('synthetic audit failure'); },
    });
    assert.equal(result.audit, 'degraded');
    assert.equal((await verifyRuntimeSnapshot(result.snapshotPath)).snapshotId, result.snapshotId);
  });

  it('keeps verify and list strictly read-only', async () => {
    const runtimeRoot = await runtimeFixture();
    const backupRoot = await temporaryDirectory('eyos-hs3-backup-');
    const result = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    const auditPath = join(backupRoot, 'operations.jsonl');
    const auditBefore = await readFile(auditPath);
    const snapshotMtime = (await stat(result.snapshotPath)).mtimeMs;
    await verifyRuntimeSnapshot(result.snapshotPath);
    const listed = await listRuntimeSnapshots(backupRoot);
    assert.equal(listed[0]?.status, 'valid');
    assert.deepEqual(await readFile(auditPath), auditBefore);
    assert.equal((await stat(result.snapshotPath)).mtimeMs, snapshotMtime);
    assert.equal(await inspectRuntimeOperationLock(runtimeRoot), null);
  });

  it('refuses creation while the service lock is held', async () => {
    const runtimeRoot = await runtimeFixture();
    const backupRoot = await temporaryDirectory('eyos-hs3-backup-');
    const serverLock = await acquireRuntimeOperationLock({ runtimeRoot, operation: 'server' });
    await assert.rejects(
      () => createRuntimeSnapshot({ runtimeRoot, backupRoot }),
      /locked by another operation/,
    );
    assert.equal((await readdir(backupRoot)).includes('snapshots'), false);
    await releaseRuntimeOperationLock(serverLock);
  });

  it('does not publish an invalid source and ignores staging when listing', async () => {
    const runtimeRoot = await runtimeFixture();
    const backupRoot = await temporaryDirectory('eyos-hs3-backup-');
    await writeFile(join(runtimeRoot, 'config', 'household.json'), '{"invalid":true}');
    await assert.rejects(() => createRuntimeSnapshot({ runtimeRoot, backupRoot }));
    assert.equal((await readdir(backupRoot)).includes('snapshots'), false);
    await mkdir(join(backupRoot, '.staging-20260902T143015.123Z-a1b2c3d4'));
    assert.deepEqual(await listRuntimeSnapshots(backupRoot), []);
  });

  it('fails closed and cleans its own state if copied-file sync still returns EPERM', async () => {
    const runtimeRoot = await runtimeFixture();
    const backupRoot = await temporaryDirectory('eyos-hs3-backup-');
    const sourceFiles = [
      'runtime.json',
      'config/household.json',
      ...RUNTIME_STORE_FILES.map(file => `data/${file}`),
    ];
    const before = await Promise.all(sourceFiles.map(file =>
      readFile(join(runtimeRoot, ...file.split('/'))),
    ));
    const syncError = Object.assign(new Error('synthetic Windows copied-file sync failure'), {
      code: 'EPERM',
    });
    await assert.rejects(
      () => createRuntimeSnapshot({
        runtimeRoot,
        backupRoot,
        now: new Date('2026-09-02T14:30:15.123Z'),
        randomPart: 'deadbeef',
        fileFlusher: async () => { throw syncError; },
      }),
      error => error === syncError,
    );
    assert.equal(await inspectRuntimeOperationLock(runtimeRoot), null);
    assert.deepEqual(await readdir(join(backupRoot, 'snapshots')), []);
    assert.equal(
      (await readdir(backupRoot)).some(name => name.startsWith('.staging-')),
      false,
    );
    const after = await Promise.all(sourceFiles.map(file =>
      readFile(join(runtimeRoot, ...file.split('/'))),
    ));
    assert.deepEqual(after, before);
  });

  it('rejects relative, UNC and Windows device namespace paths', () => {
    assert.throws(() => normalizeAbsolutePath('relative/path'), /absolute path/);
    assert.throws(() => normalizeAbsolutePath('\\\\server\\share\\eY-OS'), /absolute path/);
    assert.throws(() => normalizeAbsolutePath('\\\\?\\C:\\eY-OS'), /absolute path/);
    assert.equal(normalizeAbsolutePath('C:\\eY-OS'), 'C:\\eY-OS');
    assert.equal(normalizeAbsolutePath('/var/lib/ey-os'), '/var/lib/ey-os');
  });

  it('records SHA-256 checksums from the published payload', async () => {
    const runtimeRoot = await runtimeFixture();
    const backupRoot = await temporaryDirectory('eyos-hs3-backup-');
    const result = await createRuntimeSnapshot({ runtimeRoot, backupRoot });
    const manifest = JSON.parse(await readFile(join(result.snapshotPath, 'snapshot.json'), 'utf8')) as {
      files: Array<{ path: string; sha256: string }>;
    };
    const runtimeEntry = manifest.files.find(file => file.path === 'runtime.json');
    const expected = createHash('sha256')
      .update(await readFile(join(result.snapshotPath, 'payload', 'runtime.json'))).digest('hex');
    assert.equal(runtimeEntry?.sha256, expected);
  });
});
