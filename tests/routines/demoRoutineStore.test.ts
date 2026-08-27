import assert from 'node:assert/strict';
import {
  readFile,
} from 'node:fs/promises';
import {
  describe,
  it,
} from 'node:test';

import exampleStore from '../../app/src/data/routines.example.json' with {
  type: 'json',
};
import {
  materializeDemoRoutines,
  migrateLegacyDemoStore,
  type DemoRoutineStore,
  type LegacyDemoStore,
} from '../../app/src/routines/demoRoutineStore.ts';

const definition = {
  id: 'demo-routine',
  title: 'Safe demo routine',
  ownerProfileId: 'family',
  active: true,
  schedule: {
    daysOfWeek: [1] as const,
    startTime: null,
    endTime: null,
  },
  steps: [
    { id: 'demo-step', title: 'Safe step' },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('Demo routine store separation', () => {
  it('migrates Demo v1 data independently with legacy snapshots', () => {
    const legacy: LegacyDemoStore = {
      schemaVersion: 1,
      routines: [definition],
      occurrences: [
        {
          id: 'demo-routine@2026-08-31',
          routineId: 'demo-routine',
          localDate: '2026-08-31',
          timeZone: 'Europe/London',
          completedSteps: {
            'demo-step': '2026-08-31T07:00:00.000Z',
          },
          completedAt: '2026-08-31T07:00:00.000Z',
          updatedAt: '2026-08-31T07:00:00.000Z',
        },
      ],
    };
    const migrated = migrateLegacyDemoStore(
      legacy,
      '2026-09-01T00:00:00.000Z'
    );

    assert.equal(migrated.schemaVersion, 2);
    assert.equal(
      migrated.occurrences[0].snapshot.source,
      'legacy-migration'
    );
    assert.equal(
      migrated.occurrences[0].completedAt,
      legacy.occurrences[0].completedAt
    );
  });

  it('materialises safe Demo data without mutating the input and remains idempotent', () => {
    const data: DemoRoutineStore = {
      schemaVersion: 2,
      routines: [definition],
      occurrences: [],
    };
    const instant =
      new Date('2026-08-31T07:00:00.000Z');
    const first = materializeDemoRoutines(
      data,
      'Europe/London',
      instant
    );
    const second = materializeDemoRoutines(
      first.store,
      'Europe/London',
      instant
    );

    assert.equal(data.occurrences.length, 0);
    assert.equal(first.materializedCount, 1);
    assert.equal(second.materializedCount, 0);
    assert.equal(
      first.store.occurrences[0].snapshot.source,
      'captured'
    );
  });

  it('tracks only safe schema-v2 examples and never imports the household file into the adapter', async () => {
    assert.equal(exampleStore.schemaVersion, 2);
    assert.deepEqual(exampleStore.occurrences, []);

    const adapterSource = await readFile(
      new URL(
        '../../app/src/services/routineService.ts',
        import.meta.url
      ),
      'utf8'
    );

    assert.match(
      adapterSource,
      /ey-os-demo-routines-v2/
    );
    assert.doesNotMatch(
      adapterSource,
      /routines\.local\.json/
    );
  });
});
