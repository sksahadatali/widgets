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
  migrateDemoStoreV2,
  migrateLegacyDemoStore,
  type DemoRoutineStore,
  type LegacyDemoStore,
  type LegacyDemoStoreV2,
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
  reward: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('Demo routine store separation', () => {
  it('migrates Demo v1 data independently with legacy snapshots', () => {
    const { reward: _reward, ...legacyDefinition } = definition;
    const legacy: LegacyDemoStore = {
      schemaVersion: 1,
      routines: [legacyDefinition],
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

  it('migrates Demo v2 data non-retroactively to schema v3', () => {
    const { reward: _reward, ...legacyDefinition } = definition;
    const legacyV2: LegacyDemoStoreV2 = {
      schemaVersion: 2,
      routines: [legacyDefinition],
      occurrences: [],
    };
    const migrated = migrateDemoStoreV2(legacyV2);
    assert.equal(migrated.schemaVersion, 3);
    assert.equal(migrated.routines[0].reward, null);
  });

  it('materialises safe Demo data without mutating the input and remains idempotent', () => {
    const data: DemoRoutineStore = {
      schemaVersion: 3,
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
    assert.equal(
      first.store.occurrences[0].completionSequence,
      0
    );
  });

  it('tracks only safe schema-v3 examples and never imports the household file into the adapter', async () => {
    assert.equal(exampleStore.schemaVersion, 3);
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
      /ey-os-demo-routines-v3/
    );
    assert.doesNotMatch(
      adapterSource,
      /routines\.local\.json/
    );
  });
});
