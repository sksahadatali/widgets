import {
  access,
  readFile,
  realpath,
  stat,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

import {
  EXPECTED_RUNTIME_MANIFEST,
  assertExternalRuntimePath,
  RUNTIME_MANIFEST_NAME,
  runtimeStoreFiles,
  type RuntimeLayoutVersion,
  type RuntimeDataConfiguration,
  type RuntimeStoreFile,
} from '../config/runtimeData.js';

import { validateFamilyKnowledgeEnvelope } from '../identity/familyKnowledgeEnvelope.js';
import { validateHouseholdConfig } from '../config/householdConfig.js';

type Validator = (value: unknown) => unknown;

async function getValidators(): Promise<
  Record<RuntimeStoreFile, Validator>
> {
  const [
    routines,
    rewards,
    redemptions,
    lists,
    meals,
    kumon,
    calendarAssignments,
  ] = await Promise.all([
    import('../services/routineStore.js'),
    import('../services/rewardStore.js'),
    import('../services/redemptionStore.js'),
    import('../services/familyListStore.js'),
    import('../services/mealPlanStore.js'),
    import('../services/kumonStore.js'),
    import('../services/calendarProfileAssignmentStore.js'),
  ]);

  return {
    'family-knowledge.local.json': validateFamilyKnowledgeEnvelope,
    'routines.local.json': routines.validateRoutineStore,
    'rewards.local.json': rewards.validateRewardStore,
    'redemptions.local.json':
      redemptions.validateRedemptionStore,
    'lists.local.json': lists.validateFamilyListStore,
    'meals.local.json': meals.validateMealPlanStore,
    'kumon.local.json': kumon.validateKumonStore,
    'calendar-profile-assignments.local.json': calendarAssignments.validateCalendarProfileAssignmentStore,
  };
}

export function assertRuntimeManifest(value: unknown, version: RuntimeLayoutVersion = 3): void {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).schemaVersion !==
      EXPECTED_RUNTIME_MANIFEST.schemaVersion ||
    (value as Record<string, unknown>).kind !==
      EXPECTED_RUNTIME_MANIFEST.kind ||
    (value as Record<string, unknown>).dataLayoutVersion !==
      version ||
    Object.keys(value).some(key =>
      ![
        'schemaVersion',
        'kind',
        'dataLayoutVersion',
      ].includes(key)
    ) ||
    Object.keys(value).length !== 3
  ) {
    throw new Error(
      'The external runtime manifest is invalid.'
    );
  }
}

async function readJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(
      await readFile(filePath, 'utf8')
    ) as unknown;
  } catch (error) {
    throw new Error(
      `Required runtime file is missing or malformed: ${filePath}`,
      { cause: error }
    );
  }
}

export async function validateStoreSet(
  dataPath: string,
  version: RuntimeLayoutVersion = 3,
): Promise<void> {
  const validators = await getValidators();

  for (const fileName of runtimeStoreFiles(version)) {
    const filePath = join(dataPath, fileName);
    const value = await readJson(filePath);

    try {
      validators[fileName](value);
    } catch (error) {
      throw new Error(
        `Required runtime store is invalid: ${filePath}`,
        { cause: error }
      );
    }
  }
}

export async function preflightRuntimeData(
  configuration: RuntimeDataConfiguration,
  version: RuntimeLayoutVersion = 3,
): Promise<void> {
  if (configuration.policy !== 'required') {
    return;
  }

  if (!configuration.rootPath) {
    throw new Error(
      'External runtime configuration has no root path.'
    );
  }

  const rootStats = await stat(configuration.rootPath)
    .catch(error => {
      throw new Error(
        'The external runtime root does not exist.',
        { cause: error }
      );
    });
  const dataStats = await stat(configuration.dataPath)
    .catch(error => {
      throw new Error(
        'The external runtime data directory does not exist.',
        { cause: error }
      );
    });

  if (!rootStats.isDirectory() || !dataStats.isDirectory()) {
    throw new Error(
      'The external runtime root and data path must be directories.'
    );
  }

  assertExternalRuntimePath(
    await realpath(configuration.rootPath)
  );
  assertExternalRuntimePath(
    await realpath(configuration.dataPath)
  );

  await Promise.all([
    access(
      configuration.rootPath,
      constants.R_OK | constants.W_OK
    ),
    access(
      configuration.dataPath,
      constants.R_OK | constants.W_OK
    ),
  ]).catch(error => {
    throw new Error(
      'The external runtime root must be readable and writable.',
      { cause: error }
    );
  });

  assertRuntimeManifest(
    await readJson(
      join(
        configuration.rootPath,
        RUNTIME_MANIFEST_NAME
      )
    ), version
  );

  await Promise.all(
    runtimeStoreFiles(version).map(async fileName => {
      const filePath = join(
        configuration.dataPath,
        fileName
      );
      const fileStats = await stat(filePath).catch(error => {
        throw new Error(
          `Required runtime store is missing: ${filePath}`,
          { cause: error }
        );
      });

      if (!fileStats.isFile()) {
        throw new Error(
          `Required runtime store is not a file: ${filePath}`
        );
      }

      assertExternalRuntimePath(
        await realpath(filePath)
      );

      await access(
        filePath,
        constants.R_OK | constants.W_OK
      ).catch(error => {
        throw new Error(
          `Required runtime store is not readable and writable: ${filePath}`,
          { cause: error }
        );
      });
    })
  );
  await validateStoreSet(configuration.dataPath, version);
  if (version === 3) await validateHouseholdScope(configuration.rootPath);
}

export async function validateHouseholdScope(root: string): Promise<void> {
  const config = validateHouseholdConfig(await readJson(join(root, 'config', 'household.json')));
  const envelope = validateFamilyKnowledgeEnvelope(await readJson(join(root, 'data', 'family-knowledge.local.json')));
  if (config.household.householdId !== envelope.householdId) throw new Error('HOUSEHOLD_SCOPE_MISMATCH');
}
