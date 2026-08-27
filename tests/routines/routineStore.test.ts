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
import {
  afterEach,
  describe,
  it,
} from 'node:test';

import {
  RoutineFileStore,
  RoutineStoreError,
  validateRoutineStore,
} from '../../server/src/services/routineStore.ts';
import type {
  LegacyRoutineStoreData,
  RoutineDefinitionInput,
} from '../../server/src/types/routine.ts';

const temporaryDirectories: string[] = [];

async function makeStore() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'ey-routines-')
  );
  temporaryDirectories.push(directory);
  const filePath = path.join(
    directory,
    'routines.local.json'
  );

  return {
    directory,
    filePath,
    store: new RoutineFileStore(filePath),
  };
}

function routineInput(
  title = 'Example routine'
): RoutineDefinitionInput {
  return {
    title,
    ownerProfileId: 'family',
    active: true,
    schedule: {
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: '07:00',
      endTime: '08:00',
    },
    steps: [
      { id: 'step-1', title: 'First step' },
      { id: 'step-2', title: 'Second step' },
    ],
  };
}

function legacyStore(): LegacyRoutineStoreData {
  return {
    schemaVersion: 1,
    routines: [
      {
        id: 'routine-1',
        ...routineInput(),
        createdAt: '2026-08-30T06:00:00.000Z',
        updatedAt: '2026-08-30T06:00:00.000Z',
      },
    ],
    occurrences: [
      {
        id: 'routine-1@2026-08-31',
        routineId: 'routine-1',
        localDate: '2026-08-31',
        timeZone: 'Europe/London',
        completedSteps: {
          'step-1': '2026-08-31T07:10:00.000Z',
          'step-2': '2026-08-31T07:11:00.000Z',
        },
        completedAt: '2026-08-31T07:11:00.000Z',
        updatedAt: '2026-08-31T07:11:00.000Z',
      },
    ],
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(
      directory => rm(
        directory,
        { recursive: true, force: true }
      )
    )
  );
});

describe('RoutineFileStore', () => {
  it('creates a valid empty primary store without a backup', async () => {
    const {
      directory,
      filePath,
      store,
    } = await makeStore();

    assert.deepEqual(await store.read(), {
      schemaVersion: 2,
      routines: [],
      occurrences: [],
    });

    const files = await readdir(directory);
    assert.deepEqual(files, [
      path.basename(filePath),
    ]);
  });

  it('migrates a valid v1 store to v2 while preserving completion timestamps', async () => {
    const {
      filePath,
      store,
    } = await makeStore();
    const legacy = legacyStore();
    const legacyRaw =
      `${JSON.stringify(legacy, null, 2)}\n`;

    await writeFile(filePath, legacyRaw, 'utf8');

    const migrated = await store.read();
    const occurrence = migrated.occurrences[0];

    assert.equal(migrated.schemaVersion, 2);
    assert.deepEqual(
      occurrence.completedSteps,
      legacy.occurrences[0].completedSteps
    );
    assert.equal(
      occurrence.completedAt,
      legacy.occurrences[0].completedAt
    );
    assert.equal(
      occurrence.snapshot.source,
      'legacy-migration'
    );
    assert.equal(
      occurrence.snapshot.title,
      'Example routine'
    );
    assert.equal(
      await readFile(store.backupPath, 'utf8'),
      legacyRaw
    );
  });

  it('protects the migration recovery backup through the migration operation', async () => {
    const {
      filePath,
      store,
    } = await makeStore();
    const legacy = legacyStore();
    const legacyRaw =
      `${JSON.stringify(legacy, null, 2)}\n`;

    await writeFile(filePath, legacyRaw, 'utf8');

    await store.materializeToday(
      { timeZone: 'Europe/London' },
      new Date('2026-09-01T07:00:00.000Z')
    );

    assert.equal(
      await readFile(store.backupPath, 'utf8'),
      legacyRaw
    );
    assert.equal(
      (await store.read()).schemaVersion,
      2
    );
    assert.equal(
      await readFile(store.backupPath, 'utf8'),
      legacyRaw
    );

    const validatedV2 = await readFile(
      filePath,
      'utf8'
    );
    await store.updateRoutine(
      'routine-1',
      routineInput('After validation')
    );
    assert.equal(
      await readFile(store.backupPath, 'utf8'),
      validatedV2
    );
  });

  it('backs up the previous valid primary before atomic replacement', async () => {
    const {
      directory,
      filePath,
      store,
    } = await makeStore();

    await store.read();
    const emptyPrimary = await readFile(
      filePath,
      'utf8'
    );
    await store.createRoutine(
      'routine-1',
      routineInput(),
      '2026-08-31T07:00:00.000Z'
    );

    assert.equal(
      await readFile(store.backupPath, 'utf8'),
      emptyPrimary
    );
    assert.equal(
      (await store.read()).routines.length,
      1
    );
    assert.equal(
      (await readdir(directory)).some(
        name => name.endsWith('.tmp')
      ),
      false
    );
  });

  it('never overwrites a malformed primary during mutation', async () => {
    const {
      filePath,
      store,
    } = await makeStore();
    const malformed = '{ definitely not valid JSON';

    await writeFile(filePath, malformed, 'utf8');

    await assert.rejects(
      store.createRoutine(
        'routine-1',
        routineInput()
      ),
      RoutineStoreError
    );
    assert.equal(
      await readFile(filePath, 'utf8'),
      malformed
    );
    await assert.rejects(
      readFile(store.backupPath, 'utf8'),
      error =>
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
    );
  });

  it('supports recovery by restoring the previous valid backup', async () => {
    const {
      filePath,
      store,
    } = await makeStore();

    await store.read();
    await store.createRoutine(
      'routine-1',
      routineInput(),
      '2026-08-31T07:00:00.000Z'
    );
    const validPrimary = await readFile(
      filePath,
      'utf8'
    );

    await store.updateRoutine(
      'routine-1',
      routineInput('Updated routine'),
      '2026-08-31T07:10:00.000Z'
    );
    assert.equal(
      await readFile(store.backupPath, 'utf8'),
      validPrimary
    );

    const validBackup = await readFile(
      store.backupPath,
      'utf8'
    );
    await writeFile(filePath, '{bad', 'utf8');

    await assert.rejects(
      store.updateRoutine(
        'routine-1',
        routineInput('Must not be written')
      ),
      RoutineStoreError
    );
    assert.equal(
      await readFile(filePath, 'utf8'),
      '{bad'
    );
    assert.equal(
      await readFile(store.backupPath, 'utf8'),
      validBackup
    );

    await writeFile(
      filePath,
      validBackup,
      'utf8'
    );

    const recovered = await new RoutineFileStore(
      filePath
    ).read();
    assert.equal(
      recovered.routines[0].title,
      'Example routine'
    );
  });

  it('preserves occurrence history across dates and store restarts', async () => {
    const {
      filePath,
      store,
    } = await makeStore();

    await store.createRoutine(
      'routine-1',
      routineInput(),
      '2026-08-31T07:00:00.000Z'
    );
    await store.updateOccurrence(
      'routine-1',
      {
        localDate: '2026-08-31',
        timeZone: 'Europe/London',
        stepId: 'step-1',
        completed: true,
      },
      '2026-08-31T07:10:00.000Z'
    );
    await store.updateOccurrence(
      'routine-1',
      {
        localDate: '2026-09-01',
        timeZone: 'Europe/London',
        stepId: 'step-1',
        completed: true,
      },
      '2026-09-01T07:10:00.000Z'
    );

    const restarted = new RoutineFileStore(
      filePath
    );
    const persisted = await restarted.read();

    assert.deepEqual(
      persisted.occurrences.map(
        occurrence => occurrence.localDate
      ).sort(),
      ['2026-08-31', '2026-09-01']
    );
    assert.doesNotThrow(() =>
      validateRoutineStore(persisted)
    );
  });

  it('keeps occurrence history when a routine is deactivated', async () => {
    const { store } = await makeStore();

    await store.createRoutine(
      'routine-1',
      routineInput()
    );
    await store.updateOccurrence(
      'routine-1',
      {
        localDate: '2026-08-31',
        timeZone: 'Europe/London',
        stepId: 'step-1',
        completed: true,
      }
    );
    await store.updateRoutine(
      'routine-1',
      {
        ...routineInput(),
        active: false,
      }
    );

    const persisted = await store.read();
    assert.equal(
      persisted.routines[0].active,
      false
    );
    assert.equal(
      persisted.occurrences.length,
      1
    );
  });

  it('materialises only active routines scheduled for the household day and is idempotent', async () => {
    const { store } = await makeStore();

    await store.createRoutine(
      'scheduled-active',
      routineInput('Scheduled active')
    );
    await store.createRoutine(
      'scheduled-inactive',
      {
        ...routineInput('Scheduled inactive'),
        active: false,
      }
    );
    await store.createRoutine(
      'unscheduled-active',
      {
        ...routineInput('Unscheduled active'),
        schedule: {
          ...routineInput().schedule,
          daysOfWeek: [7],
        },
      }
    );

    const instant =
      new Date('2026-08-31T07:00:00.000Z');
    const first = await store.materializeToday(
      { timeZone: 'Europe/London' },
      instant
    );
    const second = await store.materializeToday(
      { timeZone: 'Europe/London' },
      instant
    );
    const persisted = await store.read();

    assert.deepEqual(first, {
      localDate: '2026-08-31',
      materializedCount: 1,
    });
    assert.deepEqual(second, {
      localDate: '2026-08-31',
      materializedCount: 0,
    });
    assert.deepEqual(
      persisted.occurrences.map(
        occurrence => occurrence.routineId
      ),
      ['scheduled-active']
    );
    assert.equal(
      persisted.occurrences[0].snapshot.source,
      'captured'
    );
  });

  it('does not fabricate occurrences for days when materialisation did not run', async () => {
    const { store } = await makeStore();

    await store.createRoutine(
      'routine-1',
      {
        ...routineInput(),
        schedule: {
          ...routineInput().schedule,
          daysOfWeek: [1, 2, 3],
        },
      }
    );
    await store.materializeToday(
      { timeZone: 'Europe/London' },
      new Date('2026-08-31T07:00:00.000Z')
    );
    await store.materializeToday(
      { timeZone: 'Europe/London' },
      new Date('2026-09-02T07:00:00.000Z')
    );

    assert.deepEqual(
      (await store.read()).occurrences.map(
        occurrence => occurrence.localDate
      ),
      ['2026-08-31', '2026-09-02']
    );
  });

  it('keeps a materialised snapshot immutable across definition edits', async () => {
    const { store } = await makeStore();

    await store.createRoutine(
      'routine-1',
      routineInput(),
      '2026-08-31T06:00:00.000Z'
    );
    await store.materializeToday(
      { timeZone: 'Europe/London' },
      new Date('2026-08-31T06:30:00.000Z')
    );
    const beforeEdit =
      (await store.read()).occurrences[0];

    await store.updateRoutine(
      'routine-1',
      {
        title: 'Tomorrow definition',
        ownerProfileId: 'adult-1',
        active: true,
        schedule: {
          daysOfWeek: [1, 2, 3, 4, 5],
          startTime: '18:00',
          endTime: '20:00',
        },
        steps: [
          { id: 'step-2', title: 'Renamed second' },
          { id: 'step-3', title: 'Added third' },
        ],
      },
      '2026-08-31T09:00:00.000Z'
    );

    await assert.rejects(
      store.updateOccurrence(
        'routine-1',
        {
          localDate: '2026-08-31',
          timeZone: 'Europe/London',
          stepId: 'step-3',
          completed: true,
        }
      ),
      /not found in this occurrence/
    );

    await store.updateOccurrence(
      'routine-1',
      {
        localDate: '2026-08-31',
        timeZone: 'Europe/London',
        stepId: 'step-1',
        completed: true,
      },
      '2026-08-31T07:10:00.000Z'
    );

    const afterEdit =
      (await store.read()).occurrences.find(
        occurrence =>
          occurrence.localDate === '2026-08-31'
      );

    assert.deepEqual(
      afterEdit?.snapshot,
      beforeEdit.snapshot
    );
    assert.equal(
      afterEdit?.snapshot.title,
      'Example routine'
    );
    assert.equal(
      afterEdit?.snapshot.ownerProfileId,
      'family'
    );
    assert.deepEqual(
      afterEdit?.snapshot.steps,
      routineInput().steps
    );
    assert.deepEqual(
      afterEdit?.snapshot.schedule,
      routineInput().schedule
    );

    const nextOccurrence =
      await store.updateOccurrence(
        'routine-1',
        {
          localDate: '2026-09-01',
          timeZone: 'Europe/London',
          stepId: 'step-3',
          completed: true,
        },
        '2026-09-01T18:10:00.000Z'
      );

    assert.equal(
      nextOccurrence.snapshot.title,
      'Tomorrow definition'
    );
    assert.equal(
      nextOccurrence.snapshot.ownerProfileId,
      'adult-1'
    );
    assert.deepEqual(
      nextOccurrence.snapshot.steps.map(
        step => [step.id, step.title]
      ),
      [
        ['step-2', 'Renamed second'],
        ['step-3', 'Added third'],
      ]
    );
  });

  it('permanent deletion removes only that routine and its history', async () => {
    const { store } = await makeStore();

    await store.createRoutine(
      'routine-1',
      routineInput('First')
    );
    await store.createRoutine(
      'routine-2',
      routineInput('Second')
    );
    await store.updateOccurrence(
      'routine-1',
      {
        localDate: '2026-08-31',
        timeZone: 'Europe/London',
        stepId: 'step-1',
        completed: true,
      }
    );
    await store.updateOccurrence(
      'routine-2',
      {
        localDate: '2026-08-31',
        timeZone: 'Europe/London',
        stepId: 'step-1',
        completed: true,
      }
    );

    await store.deleteRoutine('routine-1');
    const remaining = await store.read();

    assert.deepEqual(
      remaining.routines.map(routine => routine.id),
      ['routine-2']
    );
    assert.deepEqual(
      remaining.occurrences.map(
        occurrence => occurrence.routineId
      ),
      ['routine-2']
    );
  });
});
