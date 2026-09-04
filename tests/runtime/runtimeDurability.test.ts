import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { flushDirectory } from '../../server/src/runtime/runtimeDurability.js';
import {
  getRuntimeRestoreJournalPath,
  type RuntimeRestoreJournal,
  writeRuntimeRestoreJournal,
} from '../../server/src/runtime/runtimeRestoreJournal.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

const journal: RuntimeRestoreJournal = {
  schemaVersion: 2,
  operationId: '00000000-0000-4000-8000-000000000001',
  selectedSnapshotId: '20260904T000000.000Z-aaaaaaaa',
  startedAt: '2026-09-04T00:00:00.000Z',
  source: { state: 'valid', protection: { kind: 'snapshot', snapshotId: 'pending' } },
  decision: 'undecided',
  transition: 'prepare',
  transitionState: 'intent',
};

describe('restore durability primitives', () => {
  it('tolerates only the established unsupported directory flush errors', async () => {
    for (const code of ['EISDIR', 'EINVAL', 'EPERM', 'ENOTSUP']) {
      await assert.doesNotReject(() => flushDirectory('/synthetic', async () => {
        throw Object.assign(new Error(code), { code });
      }));
    }
    await assert.rejects(
      () => flushDirectory('/synthetic', async () => {
        throw Object.assign(new Error('unexpected I/O'), { code: 'EIO' });
      }),
      /unexpected I\/O/,
    );
  });

  it('publishes synchronized journal data before flushing its parent', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'eyos-journal-durability-'));
    roots.push(parent);
    const runtimeRoot = join(parent, 'runtime');
    await mkdir(runtimeRoot);
    let flushed = false;
    await writeRuntimeRestoreJournal(runtimeRoot, journal, async path => {
      assert.equal(path, dirname(getRuntimeRestoreJournalPath(runtimeRoot)));
      const published = JSON.parse(
        await readFile(getRuntimeRestoreJournalPath(runtimeRoot), 'utf8'),
      ) as RuntimeRestoreJournal;
      assert.equal(published.transition, 'prepare');
      flushed = true;
    });
    assert.equal(flushed, true);
  });

  it('keeps unexpected journal-parent flush failures fatal after publication', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'eyos-journal-durability-'));
    roots.push(parent);
    const runtimeRoot = join(parent, 'runtime');
    await mkdir(runtimeRoot);
    await assert.rejects(
      () => writeRuntimeRestoreJournal(runtimeRoot, journal, async () => {
        throw Object.assign(new Error('synthetic parent flush failure'), { code: 'EIO' });
      }),
      /synthetic parent flush failure/,
    );
    assert.equal(JSON.parse(
      await readFile(getRuntimeRestoreJournalPath(runtimeRoot), 'utf8'),
    ).schemaVersion, 2);
  });
});
