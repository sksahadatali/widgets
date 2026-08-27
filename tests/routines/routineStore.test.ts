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
      schemaVersion: 1,
      routines: [],
      occurrences: [],
    });

    const files = await readdir(directory);
    assert.deepEqual(files, [
      path.basename(filePath),
    ]);
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

  it('treats a newly added step as incomplete for the current occurrence', async () => {
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
      },
      '2026-08-31T07:10:00.000Z'
    );
    const firstCompletion =
      await store.updateOccurrence(
        'routine-1',
        {
          localDate: '2026-08-31',
          timeZone: 'Europe/London',
          stepId: 'step-2',
          completed: true,
        },
        '2026-08-31T07:11:00.000Z'
      );
    assert.equal(
      firstCompletion.completedAt,
      '2026-08-31T07:11:00.000Z'
    );

    await store.updateRoutine(
      'routine-1',
      {
        ...routineInput(),
        steps: [
          ...routineInput().steps,
          { id: 'step-3', title: 'New step' },
        ],
      }
    );
    const completedAgain =
      await store.updateOccurrence(
        'routine-1',
        {
          localDate: '2026-08-31',
          timeZone: 'Europe/London',
          stepId: 'step-3',
          completed: true,
        },
        '2026-08-31T07:30:00.000Z'
      );

    assert.equal(
      completedAgain.completedAt,
      '2026-08-31T07:30:00.000Z'
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
