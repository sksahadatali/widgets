import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  afterEach,
  describe,
  it,
} from 'node:test';

import {
  assertExternalRuntimePath,
  configureRuntimeData,
  EXPECTED_RUNTIME_MANIFEST,
  getRuntimeStoreOptions,
  normalizeAbsolutePath,
  RUNTIME_STORE_FILES,
} from '../../server/src/config/runtimeData.js';
import {
  FamilyListFileStore,
  SHOPPING_LIST_ID,
} from '../../server/src/services/familyListStore.js';
import { KumonFileStore } from '../../server/src/services/kumonStore.js';
import { MealPlanFileStore } from '../../server/src/services/mealPlanStore.js';
import { RedemptionFileStore } from '../../server/src/services/redemptionStore.js';
import { RewardFileStore } from '../../server/src/services/rewardStore.js';
import { RoutineFileStore } from '../../server/src/services/routineStore.js';
import { migrateRuntimeData } from '../../server/src/runtime/runtimeMigration.js';
import { preflightRuntimeData } from '../../server/src/runtime/runtimeValidation.js';
import {
  reconcileRoutineRewards,
} from '../../server/src/services/routineRewardReconciler.js';
import {
  RedemptionAccountingService,
} from '../../server/src/services/redemptionAccountingService.js';

const temporaryPaths: string[] = [];
const timestamp = '2026-09-01T00:00:00.000Z';
const execFileAsync = promisify(execFile);

const stores: Record<string, unknown> = {
  'routines.local.json': {
    schemaVersion: 3,
    routines: [],
    occurrences: [],
  },
  'rewards.local.json': {
    schemaVersion: 1,
    transactions: [],
  },
  'redemptions.local.json': {
    schemaVersion: 1,
    catalogue: [],
    requests: [],
  },
  'lists.local.json': {
    schemaVersion: 1,
    lists: [{
      id: SHOPPING_LIST_ID,
      systemKey: 'shopping',
      name: 'Shopping',
      active: true,
      items: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
  },
  'meals.local.json': {
    schemaVersion: 1,
    entries: [],
  },
  'kumon.local.json': {
    schemaVersion: 1,
    assignments: [],
  },
};

async function temporaryDirectory(
  prefix: string
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryPaths.push(directory);
  return directory;
}

async function writeStoreSet(dataPath: string): Promise<void> {
  await mkdir(dataPath, { recursive: true });
  await Promise.all(
    RUNTIME_STORE_FILES.map(fileName =>
      writeFile(
        join(dataPath, fileName),
        `${JSON.stringify(stores[fileName], null, 2)}\n`,
        'utf8'
      )
    )
  );
}

async function writeRuntimeRoot(rootPath: string): Promise<void> {
  await writeStoreSet(join(rootPath, 'data'));
  await writeFile(
    join(rootPath, 'runtime.json'),
    `${JSON.stringify(EXPECTED_RUNTIME_MANIFEST, null, 2)}\n`,
    'utf8'
  );
}

async function sha256(path: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

afterEach(async () => {
  configureRuntimeData({
    serverMode: 'development',
    appMode: 'household',
  });
  await Promise.all(
    temporaryPaths.splice(0).map(path =>
      rm(path, { recursive: true, force: true })
    )
  );
});

describe('runtime-root contract', () => {
  it('accepts Windows drive-letter and POSIX absolute paths', () => {
    assert.equal(
      normalizeAbsolutePath(
        'C:\\Users\\Example\\AppData\\Local\\eY-OS'
      ),
      'C:\\Users\\Example\\AppData\\Local\\eY-OS'
    );
    assert.equal(
      normalizeAbsolutePath('/var/lib/ey-os'),
      '/var/lib/ey-os'
    );

    const windowsRuntime = configureRuntimeData({
      serverMode: 'production',
      appMode: 'household',
      runtimeDirectory:
        'C:\\Users\\Example\\AppData\\Local\\eY-OS',
    });
    assert.equal(
      windowsRuntime.dataPath,
      'C:\\Users\\Example\\AppData\\Local\\eY-OS\\data'
    );

    const posixRuntime = configureRuntimeData({
      serverMode: 'production',
      appMode: 'household',
      runtimeDirectory: '/var/lib/ey-os',
    });
    assert.equal(posixRuntime.dataPath, '/var/lib/ey-os/data');
  });

  it('passes the --root value to runtime validation', async () => {
    const scriptPath = fileURLToPath(new URL(
      '../../server/src/scripts/validateRuntimeData.ts',
      import.meta.url
    ));
    const missingWindowsRoot =
      `C:\\__eyos-runtime-test-${process.pid}__`;

    await assert.rejects(
      () => execFileAsync(
        process.execPath,
        [
          '--import',
          'tsx',
          scriptPath,
          '--root',
          missingWindowsRoot,
        ],
        { cwd: fileURLToPath(new URL('../../server/', import.meta.url)) }
      ),
      error => {
        const failure = error as Error & { stderr?: string };
        assert.doesNotMatch(
          failure.stderr ?? '',
          /must be an absolute path/
        );
        assert.match(
          failure.stderr ?? '',
          /external runtime root does not exist/
        );
        return true;
      }
    );
  });

  it('requires one absolute external root for Household production', () => {
    assert.throws(
      () => configureRuntimeData({
        serverMode: 'production',
        appMode: 'household',
      }),
      /requires EYOS_RUNTIME_DIR/
    );
    assert.throws(
      () => configureRuntimeData({
        serverMode: 'production',
        appMode: 'household',
        runtimeDirectory: 'relative/runtime',
      }),
      /absolute path/
    );
    assert.throws(
      () => normalizeAbsolutePath('..\\relative\\runtime'),
      /absolute path/
    );
    assert.throws(
      () => assertExternalRuntimePath(
        fileURLToPath(new URL('../../', import.meta.url))
      ),
      /outside the Git checkout/
    );
  });

  it('keeps development compatible with repository-local initialization', () => {
    const runtime = configureRuntimeData({
      serverMode: 'development',
      appMode: 'household',
    });

    assert.equal(runtime.policy, 'initialize');
    assert.equal(runtime.external, false);
  });

  it('disables datastore access for Demo regardless of the variable', () => {
    const runtime = configureRuntimeData({
      serverMode: 'production',
      appMode: 'demo',
      runtimeDirectory: '/ignored/by/demo',
    });

    assert.equal(runtime.policy, 'disabled');
    assert.equal(runtime.rootPath, null);
  });
});

describe('strict store access', () => {
  it('does not initialize a missing required primary', async () => {
    const directory = await temporaryDirectory('ey-required-');
    const path = join(directory, 'missing.json');
    const store = new RewardFileStore(path, 'required');

    await assert.rejects(
      () => store.read(),
      /required Rewards datastore is missing/
    );
    await assert.rejects(() => access(path));
  });

  it('does not touch the filesystem when access is disabled', async () => {
    const directory = await temporaryDirectory('ey-disabled-');
    const path = join(directory, 'never', 'kumon.json');
    const store = new KumonFileStore(path, 'disabled');

    await assert.rejects(
      () => store.read(),
      /disabled in Demo mode/
    );
    await assert.rejects(() => stat(join(directory, 'never')));
  });

  it('resolves all six default stores under the configured root', async () => {
    const parent = await temporaryDirectory('ey-root-parent-');
    const root = join(parent, 'runtime');
    await mkdir(root);
    await writeRuntimeRoot(root);
    const runtime = configureRuntimeData({
      serverMode: 'production',
      appMode: 'household',
      runtimeDirectory: root,
    });
    await preflightRuntimeData(runtime);

    const fileNames = RUNTIME_STORE_FILES.map(fileName =>
      getRuntimeStoreOptions(fileName).filePath
    );
    assert.deepEqual(
      fileNames,
      RUNTIME_STORE_FILES.map(fileName =>
        join(root, 'data', fileName)
      )
    );

    await Promise.all([
      new RoutineFileStore().read(),
      new RewardFileStore().read(),
      new RedemptionFileStore().read(),
      new FamilyListFileStore().read(),
      new MealPlanFileStore().read(),
      new KumonFileStore().read(),
    ]);
  });
});

describe('production preflight', () => {
  it('accepts a complete initialized external Household root', async () => {
    const parent = await temporaryDirectory('ey-valid-parent-');
    const root = join(parent, 'runtime');
    await mkdir(root);
    await writeRuntimeRoot(root);

    await preflightRuntimeData(configureRuntimeData({
      serverMode: 'production',
      appMode: 'household',
      runtimeDirectory: root,
    }));
  });

  it('fails closed for missing, partial, or malformed stores', async () => {
    const parent = await temporaryDirectory('ey-invalid-parent-');
    const root = join(parent, 'runtime');
    await mkdir(root);
    await writeRuntimeRoot(root);
    await rm(join(root, 'data', 'meals.local.json'));

    const runtime = configureRuntimeData({
      serverMode: 'production',
      appMode: 'household',
      runtimeDirectory: root,
    });
    await assert.rejects(
      () => preflightRuntimeData(runtime),
      /runtime store is missing/
    );

    await writeFile(
      join(root, 'data', 'meals.local.json'),
      '{malformed',
      'utf8'
    );
    await assert.rejects(
      () => preflightRuntimeData(runtime),
      /missing or malformed/
    );
  });
});

describe('external cross-store operations', () => {
  it('reconciles Routines and Rewards within one external root', async () => {
    const parent = await temporaryDirectory('ey-cross-routine-');
    const root = join(parent, 'runtime');
    await mkdir(root);
    await writeRuntimeRoot(root);
    configureRuntimeData({
      serverMode: 'production',
      appMode: 'household',
      runtimeDirectory: root,
    });
    const routines = new RoutineFileStore();
    const rewards = new RewardFileStore();
    await routines.createRoutine('routine-1', {
      title: 'Synthetic routine',
      ownerProfileId: 'child-1',
      active: true,
      schedule: {
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        startTime: null,
        endTime: null,
      },
      steps: [{ id: 'step-1', title: 'Synthetic step' }],
      reward: {
        recipientProfileId: 'child-1',
        currency: 'star',
        amount: 3,
      },
    }, timestamp);
    await routines.materializeToday(
      { timeZone: 'Europe/London' },
      new Date('2026-09-01T12:00:00.000Z')
    );
    await routines.updateOccurrence('routine-1', {
      localDate: '2026-09-01',
      timeZone: 'Europe/London',
      stepId: 'step-1',
      completed: true,
    }, '2026-09-01T12:01:00.000Z');

    await reconcileRoutineRewards(routines, rewards);
    assert.equal(
      (await rewards.read()).transactions[0]?.amount,
      3
    );
  });

  it('keeps Redemption accounting and Rewards in the same external root', async () => {
    const parent = await temporaryDirectory('ey-cross-redemption-');
    const root = join(parent, 'runtime');
    await mkdir(root);
    await writeRuntimeRoot(root);
    configureRuntimeData({
      serverMode: 'production',
      appMode: 'household',
      runtimeDirectory: root,
    });
    const rewards = new RewardFileStore();
    const redemptions = new RedemptionFileStore();
    const itemId = '11111111-1111-4111-8111-111111111111';
    const requestId = '22222222-2222-4222-8222-222222222222';
    const now = new Date(timestamp);

    await rewards.appendAward('award-1', {
      profileId: 'child-1',
      amount: 10,
      category: 'helping',
      reason: 'Synthetic test award',
      source: {
        kind: 'manual-parent-award',
        eventKey: 'manual-award:runtime-test',
      },
      actorProfileId: 'adult-1',
      timeZone: 'Europe/London',
    }, now);
    await redemptions.createCatalogueItem({
      id: itemId,
      name: 'Synthetic reward',
      description: null,
      starCost: 4,
    }, now);
    await redemptions.createRequest({
      id: requestId,
      catalogueItemId: itemId,
      profileId: 'child-1',
      requestedByProfileId: 'child-1',
      timeZone: 'Europe/London',
    }, now);
    const accounting = new RedemptionAccountingService(
      redemptions,
      rewards,
      () => 'redemption-transaction-1'
    );

    await accounting.approve(requestId, 'adult-1', now);
    assert.deepEqual(
      (await rewards.read()).transactions.map(item => item.amount),
      [10, -4]
    );
  });
});

describe('copy-only migration', () => {
  it('validates, hashes, stages, and atomically publishes six primaries', async () => {
    const source = await temporaryDirectory('ey-source-');
    await writeStoreSet(source);
    const parent = await temporaryDirectory('ey-target-parent-');
    const target = join(parent, 'household-runtime');
    const sourceHashes = await Promise.all(
      RUNTIME_STORE_FILES.map(fileName =>
        sha256(join(source, fileName))
      )
    );

    await migrateRuntimeData({
      sourceDataPath: source,
      targetRuntimePath: target,
    });

    assert.deepEqual(
      JSON.parse(await readFile(
        join(target, 'runtime.json'),
        'utf8'
      )),
      EXPECTED_RUNTIME_MANIFEST
    );
    assert.deepEqual(
      await Promise.all(
        RUNTIME_STORE_FILES.map(fileName =>
          sha256(join(target, 'data', fileName))
        )
      ),
      sourceHashes
    );
    assert.deepEqual(
      await Promise.all(
        RUNTIME_STORE_FILES.map(fileName =>
          sha256(join(source, fileName))
        )
      ),
      sourceHashes
    );
    await assert.rejects(
      () => access(
        join(target, 'data', 'rewards.local.json.bak')
      )
    );
  });

  it('leaves source and target untouched when a primary is malformed', async () => {
    const source = await temporaryDirectory('ey-bad-source-');
    await writeStoreSet(source);
    await writeFile(
      join(source, 'rewards.local.json'),
      '{bad',
      'utf8'
    );
    const parent = await temporaryDirectory('ey-bad-target-');
    const target = join(parent, 'runtime');

    await assert.rejects(
      () => migrateRuntimeData({
        sourceDataPath: source,
        targetRuntimePath: target,
      }),
      /missing or malformed/
    );
    assert.equal(
      await readFile(join(source, 'rewards.local.json'), 'utf8'),
      '{bad'
    );
    await assert.rejects(() => access(target));
  });
});
