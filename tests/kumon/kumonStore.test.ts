import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  getKumonLocalDate,
  KumonConflictError,
  KumonFileStore,
  KumonStoreCorruptError,
  KumonStoreError,
  shiftKumonLocalDate,
  validateKumonStore,
} from '../../server/src/services/kumonStore.ts';

const ID_ONE = '11111111-1111-4111-8111-111111111111';
const ID_TWO = '22222222-2222-4222-8222-222222222222';
const ID_THREE = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-08-31T09:00:00.000Z');
const LATER = new Date('2026-08-31T10:00:00.000Z');
const NEXT_DAY = new Date('2026-09-01T09:00:00.000Z');
const directories: string[] = [];

function input(overrides: Record<string, unknown> = {}) {
  return {
    childProfileId: 'child-1',
    subject: 'maths',
    assignmentLabel: 'Worksheets 121–130',
    totalUnits: 10,
    timeZone: 'Europe/London',
    ...overrides,
  };
}

async function makeStore() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ey-kumon-'));
  directories.push(directory);
  const filePath = path.join(directory, 'kumon.local.json');
  return { directory, filePath, store: new KumonFileStore(filePath) };
}

function persisted(overrides: Record<string, unknown> = {}) {
  return {
    id: ID_ONE,
    localDate: '2026-08-31',
    childProfileId: 'child-1',
    subject: 'maths',
    assignmentLabel: 'Worksheets 121–130',
    totalUnits: 10,
    completedUnits: 0,
    completedAt: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe('Kumon store validation and safe persistence', () => {
  it('initializes and reconstructs an empty schema-v1 store', async () => {
    const { filePath, store } = await makeStore();
    assert.deepEqual(await store.read(), { schemaVersion: 1, assignments: [] });
    assert.deepEqual(await new KumonFileStore(filePath).read(), { schemaVersion: 1, assignments: [] });
  });

  it('strictly validates schema, canonical identity, dates, owner, subject and bounds', () => {
    const valid = { schemaVersion: 1, assignments: [persisted()] };
    assert.doesNotThrow(() => validateKumonStore(valid));
    assert.doesNotThrow(() => validateKumonStore({
      schemaVersion: 1,
      assignments: [persisted({ localDate: '2024-02-29' })],
    }));
    const invalid = [
      { ...valid, schemaVersion: 2 },
      { ...valid, extra: true },
      { schemaVersion: 1, assignments: [persisted({ id: 'bad' })] },
      { schemaVersion: 1, assignments: [persisted({ id: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' })] },
      { schemaVersion: 1, assignments: [persisted({ localDate: '2026-02-30' })] },
      { schemaVersion: 1, assignments: [persisted({ childProfileId: '' })] },
      { schemaVersion: 1, assignments: [persisted({ childProfileId: 'family' })] },
      { schemaVersion: 1, assignments: [persisted({ subject: 'science' })] },
      { schemaVersion: 1, assignments: [persisted({ assignmentLabel: ' padded ' })] },
      { schemaVersion: 1, assignments: [persisted({ assignmentLabel: 'x'.repeat(121) })] },
      { schemaVersion: 1, assignments: [persisted({ totalUnits: 0 })] },
      { schemaVersion: 1, assignments: [persisted({ totalUnits: 101 })] },
      { schemaVersion: 1, assignments: [persisted({ completedUnits: -1 })] },
      { schemaVersion: 1, assignments: [persisted({ completedUnits: 11 })] },
      { schemaVersion: 1, assignments: [persisted({ completedUnits: 10, completedAt: null })] },
      { schemaVersion: 1, assignments: [persisted({ completedAt: NOW.toISOString() })] },
      { schemaVersion: 1, assignments: [persisted(), persisted({ id: ID_TWO })] },
    ];
    invalid.forEach(value => assert.throws(() => validateKumonStore(value), KumonStoreCorruptError));
  });

  it('preserves the previous valid file as backup and leaves no temporary files', async () => {
    const { directory, filePath, store } = await makeStore();
    await store.read();
    const initial = await readFile(filePath, 'utf8');
    await store.createAssignment(ID_ONE, input(), NOW);
    assert.equal(await readFile(store.backupPath, 'utf8'), initial);
    assert.equal((await readdir(directory)).some(name => name.endsWith('.tmp')), false);
  });

  it('fails closed without replacing malformed private data or its valid backup', async () => {
    const { filePath, store } = await makeStore();
    await store.read();
    await store.createAssignment(ID_ONE, input(), NOW);
    const backup = await readFile(store.backupPath, 'utf8');
    const malformed = '{ private malformed bytes';
    await writeFile(filePath, malformed);
    await assert.rejects(store.read(), KumonStoreCorruptError);
    assert.equal(await readFile(filePath, 'utf8'), malformed);
    assert.equal(await readFile(store.backupPath, 'utf8'), backup);
  });
});

describe('Kumon assignment and progress rules', () => {
  it('creates trimmed today-only Maths and English assignments', async () => {
    const { store } = await makeStore();
    const maths = await store.createAssignment(ID_ONE, input({ assignmentLabel: '  Worksheets 121–130  ' }), NOW);
    const english = await store.createAssignment(ID_TWO, input({ subject: 'english', assignmentLabel: 'English pages 1–5', totalUnits: 5 }), NOW);
    assert.equal(maths.assignment.localDate, '2026-08-31');
    assert.equal(maths.assignment.assignmentLabel, 'Worksheets 121–130');
    assert.deepEqual((await store.read()).assignments.map(item => item.subject), ['maths', 'english']);
  });

  it('rejects Family ownership, invalid subject, labels and unit bounds', async () => {
    const { store } = await makeStore();
    for (const invalid of [
      input({ childProfileId: 'family' }), input({ subject: 'science' }),
      input({ assignmentLabel: ' ' }), input({ totalUnits: 0 }), input({ totalUnits: 101 }),
    ]) await assert.rejects(store.createAssignment(ID_ONE, invalid, NOW), KumonStoreError);
  });

  it('enforces one subject per child/date while allowing another child or subject', async () => {
    const { store } = await makeStore();
    await store.createAssignment(ID_ONE, input(), NOW);
    await assert.rejects(store.createAssignment(ID_TWO, input(), NOW), KumonConflictError);
    await store.createAssignment(ID_TWO, input({ subject: 'english' }), NOW);
    await store.createAssignment(ID_THREE, input({ childProfileId: 'child-2' }), NOW);
    assert.equal((await store.read()).assignments.length, 3);
  });

  it('uses absolute progress idempotently and supports completion, reopening and recompletion', async () => {
    const { store } = await makeStore();
    await store.createAssignment(ID_ONE, input(), NOW);
    const progressed = await store.setProgress(ID_ONE, { completedUnits: 6, timeZone: 'Europe/London' }, LATER);
    assert.equal(progressed.completedUnits, 6);
    const retry = await store.setProgress(ID_ONE, { completedUnits: 6, timeZone: 'Europe/London' }, new Date('2026-08-31T11:00:00Z'));
    assert.equal(retry.updatedAt, progressed.updatedAt);
    const completed = await store.setProgress(ID_ONE, { completedUnits: 10, timeZone: 'Europe/London' }, new Date('2026-08-31T12:00:00Z'));
    assert.equal(completed.completedAt, '2026-08-31T12:00:00.000Z');
    const reopened = await store.setProgress(ID_ONE, { completedUnits: 9, timeZone: 'Europe/London' }, new Date('2026-08-31T13:00:00Z'));
    assert.equal(reopened.completedAt, null);
    const recompleted = await store.setProgress(ID_ONE, { completedUnits: 10, timeZone: 'Europe/London' }, new Date('2026-08-31T14:00:00Z'));
    assert.equal(recompleted.completedAt, '2026-08-31T14:00:00.000Z');
  });

  it('rejects progress outside the assignment and definition changes after progress starts', async () => {
    const { store } = await makeStore();
    await store.createAssignment(ID_ONE, input(), NOW);
    await assert.rejects(store.setProgress(ID_ONE, { completedUnits: 11, timeZone: 'Europe/London' }, LATER), KumonStoreError);
    await store.setProgress(ID_ONE, { completedUnits: 1, timeZone: 'Europe/London' }, LATER);
    await assert.rejects(store.updateAssignment(ID_ONE, {
      assignmentLabel: 'Changed', totalUnits: 1, timeZone: 'Europe/London',
    }, LATER), /cannot change after progress/);
  });

  it('edits and deletes only unstarted assignments for the current Household date', async () => {
    const { store } = await makeStore();
    await store.createAssignment(ID_ONE, input(), NOW);
    const edited = await store.updateAssignment(ID_ONE, {
      assignmentLabel: 'Worksheets 131–140', totalUnits: 10, timeZone: 'Europe/London',
    }, LATER);
    assert.equal(edited.assignmentLabel, 'Worksheets 131–140');
    await assert.rejects(store.updateAssignment(ID_ONE, {
      assignmentLabel: 'Historical edit', totalUnits: 10, timeZone: 'Europe/London',
    }, NEXT_DAY), /Historical/);
    await assert.rejects(store.deleteAssignment(ID_ONE, 'Europe/London', NEXT_DAY), /Historical/);
    await store.deleteAssignment(ID_ONE, 'Europe/London', LATER);
    assert.deepEqual((await store.read()).assignments, []);
  });

  it('prevents deletion after progress and serializes concurrent mutations', async () => {
    const { store } = await makeStore();
    await store.createAssignment(ID_ONE, input(), NOW);
    await store.setProgress(ID_ONE, { completedUnits: 1, timeZone: 'Europe/London' }, LATER);
    await assert.rejects(store.deleteAssignment(ID_ONE, 'Europe/London', LATER), /cannot be deleted/);
    await Promise.all([
      store.createAssignment(ID_TWO, input({ subject: 'english' }), NOW),
      store.createAssignment(ID_THREE, input({ childProfileId: 'child-2' }), NOW),
    ]);
    assert.equal((await store.read()).assignments.length, 3);
  });

  it('returns bounded durable history without carry-forward', async () => {
    const { store } = await makeStore();
    await store.createAssignment(ID_ONE, input(), NOW);
    await store.createAssignment(ID_TWO, input(), NEXT_DAY);
    assert.deepEqual((await store.readRange('2026-08-26', '2026-08-31')).map(item => item.id), [ID_ONE]);
    assert.equal((await store.read()).assignments.find(item => item.id === ID_ONE)?.completedUnits, 0);
  });
});

describe('Kumon Household civil dates', () => {
  it('uses Household timezone near midnight and across London DST', () => {
    assert.equal(getKumonLocalDate(new Date('2026-08-31T23:30:00Z'), 'Europe/London'), '2026-09-01');
    assert.equal(getKumonLocalDate(new Date('2026-03-29T00:30:00Z'), 'Europe/London'), '2026-03-29');
    assert.equal(getKumonLocalDate(new Date('2026-03-29T23:30:00Z'), 'Europe/London'), '2026-03-30');
  });

  it('rolls day, month and year boundaries correctly', () => {
    assert.equal(shiftKumonLocalDate('2026-08-31', 1), '2026-09-01');
    assert.equal(shiftKumonLocalDate('2026-12-31', 1), '2027-01-01');
    assert.equal(shiftKumonLocalDate('2026-01-01', -1), '2025-12-31');
  });
});
