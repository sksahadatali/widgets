import { createHash, randomUUID } from 'node:crypto';
import { access, copyFile, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { validateHouseholdConfig } from '../config/householdConfig.js';
import { assertExternalRuntimePath, EXPECTED_RUNTIME_MANIFEST, isPathWithin } from '../config/runtimeData.js';
import { validateFamilyListStore } from '../services/familyListStore.js';
import { validateKumonStore } from '../services/kumonStore.js';
import { validateMealPlanStore } from '../services/mealPlanStore.js';
import { validateRedemptionStore } from '../services/redemptionStore.js';
import { validateRewardStore } from '../services/rewardStore.js';
import { validateRoutineStore } from '../services/routineStore.js';
import { EMPTY_CALENDAR_PROFILE_ASSIGNMENT_STORE } from '../services/calendarProfileAssignmentStore.js';
import { acquireRuntimeOperationLock, releaseRuntimeOperationLock } from './runtimeOperationLock.js';
import { readRuntimeRestoreJournal } from './runtimeRestoreJournal.js';
import { preflightRuntimeData } from './runtimeValidation.js';

const LAYOUT_1_STORES = [
  ['routines.local.json', validateRoutineStore],
  ['rewards.local.json', validateRewardStore],
  ['redemptions.local.json', validateRedemptionStore],
  ['lists.local.json', validateFamilyListStore],
  ['meals.local.json', validateMealPlanStore],
  ['kumon.local.json', validateKumonStore],
] as const;

async function exists(path: string): Promise<boolean> {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}
async function hash(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}
async function safeFile(path: string, rootReal: string): Promise<void> {
  const entry = await lstat(path);
  if (!entry.isFile() || entry.isSymbolicLink() || !isPathWithin(rootReal, await realpath(path))) {
    throw new Error('LAYOUT_MIGRATION_SOURCE_UNSAFE');
  }
}
function exactEntries(actual: string[], expected: string[]): boolean {
  const sorted = (values: string[]) => [...values].sort((a, b) => a.localeCompare(b, 'en'));
  return JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
}

export async function migrateRuntimeLayout1To2(options: {
  sourceRuntimePath: string;
  targetRuntimePath: string;
  confirmed: boolean;
}): Promise<void> {
  if (!options.confirmed) throw new Error('Layout migration requires --confirm-layout-2-migration.');
  const source = assertExternalRuntimePath(options.sourceRuntimePath);
  const target = assertExternalRuntimePath(options.targetRuntimePath);
  if (source === target) throw new Error('Layout migration target must differ from source.');
  if (await exists(target)) throw new Error('Layout migration target already exists; no files were changed.');
  if (await readRuntimeRestoreJournal(source)) throw new Error('RESTORE_RECOVERY_REQUIRED');
  const parent = dirname(target);
  await access(parent, constants.R_OK | constants.W_OK);
  const sourceEntry = await lstat(source);
  if (!sourceEntry.isDirectory() || sourceEntry.isSymbolicLink()) throw new Error('LAYOUT_MIGRATION_SOURCE_UNSAFE');
  const sourceReal = await realpath(source);
  const parentReal = await realpath(parent);
  const targetRealCandidate = join(parentReal, basename(target));
  assertExternalRuntimePath(targetRealCandidate);
  if (isPathWithin(sourceReal, targetRealCandidate) || isPathWithin(targetRealCandidate, sourceReal)) {
    throw new Error('Layout migration source and target must not contain one another.');
  }
  const lock = await acquireRuntimeOperationLock({ runtimeRoot: source, operation: 'migration' });
  const staging = join(parent, `.${basename(target)}.staging-${randomUUID()}`);
  try {
    if (!exactEntries(await readdir(source), ['runtime.json', 'config', 'data'])) throw new Error('LAYOUT_MIGRATION_SOURCE_INVENTORY_INVALID');
    for (const directory of ['config', 'data']) {
      const path = join(source, directory);
      const entry = await lstat(path);
      if (!entry.isDirectory() || entry.isSymbolicLink() || !isPathWithin(sourceReal, await realpath(path))) throw new Error('LAYOUT_MIGRATION_SOURCE_UNSAFE');
    }
    if (!exactEntries(await readdir(join(source, 'config')), ['household.json'])) throw new Error('LAYOUT_MIGRATION_SOURCE_INVENTORY_INVALID');
    const sourceDataEntries = await readdir(join(source, 'data'));
    const primaryNames = LAYOUT_1_STORES.map(([file]) => file);
    const allowedNames = new Set([...primaryNames, ...primaryNames.map(file => `${file}.bak`)]);
    if (primaryNames.some(file => !sourceDataEntries.includes(file)) || sourceDataEntries.some(file => !allowedNames.has(file))) {
      throw new Error('LAYOUT_MIGRATION_SOURCE_INVENTORY_INVALID');
    }
    for (const backup of sourceDataEntries.filter(file => file.endsWith('.bak'))) await safeFile(join(source, 'data', backup), sourceReal);
    const manifestPath = join(source, 'runtime.json');
    await safeFile(manifestPath, sourceReal);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
    if (Object.keys(manifest).length !== 3 || manifest.schemaVersion !== 1 || manifest.kind !== 'eyos-household-runtime' || manifest.dataLayoutVersion !== 1) {
      throw new Error('LAYOUT_MIGRATION_SOURCE_MANIFEST_INVALID');
    }
    const configPath = join(source, 'config', 'household.json');
    await safeFile(configPath, sourceReal);
    validateHouseholdConfig(JSON.parse(await readFile(configPath, 'utf8')) as unknown);
    for (const [file, validator] of LAYOUT_1_STORES) {
      const path = join(source, 'data', file);
      await safeFile(path, sourceReal);
      validator(JSON.parse(await readFile(path, 'utf8')) as unknown);
    }

    await mkdir(join(staging, 'config'), { recursive: true });
    await mkdir(join(staging, 'data'), { recursive: true });
    const copied = [['config/household.json', configPath], ...LAYOUT_1_STORES.map(([file]) => [`data/${file}`, join(source, 'data', file)] as const)];
    for (const [relative, from] of copied) {
      const to = join(staging, ...relative.split('/'));
      await copyFile(from, to, constants.COPYFILE_EXCL);
      if (await hash(from) !== await hash(to)) throw new Error('LAYOUT_MIGRATION_CHECKSUM_MISMATCH');
    }
    await writeFile(join(staging, 'data', 'calendar-profile-assignments.local.json'), `${JSON.stringify(EMPTY_CALENDAR_PROFILE_ASSIGNMENT_STORE, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await writeFile(join(staging, 'runtime.json'), `${JSON.stringify(EXPECTED_RUNTIME_MANIFEST, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await preflightRuntimeData({ appMode: 'household', rootPath: staging, dataPath: join(staging, 'data'), policy: 'required', external: true });
    validateHouseholdConfig(JSON.parse(await readFile(join(staging, 'config', 'household.json'), 'utf8')) as unknown);
    await rename(staging, target);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  } finally {
    await releaseRuntimeOperationLock(lock);
  }
}
