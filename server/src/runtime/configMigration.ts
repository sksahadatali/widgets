import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
  HOUSEHOLD_CONFIG_FILE,
  RUNTIME_CONFIG_DIRECTORY,
  validateHouseholdConfig,
  validateLegacyHouseholdConfig,
} from '../config/householdConfig.js';
import { assertExternalRuntimePath, configureRuntimeData, normalizeAbsolutePath } from '../config/runtimeData.js';
import { preflightRuntimeData } from './runtimeValidation.js';

async function exists(path: string): Promise<boolean> {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function migrateHouseholdConfig(options: { sourcePath: string; runtimeRoot: string }): Promise<void> {
  const sourcePath = normalizeAbsolutePath(options.sourcePath, 'Configuration migration source');
  const runtimeRoot = assertExternalRuntimePath(options.runtimeRoot);
  const sourceStats = await stat(sourcePath).catch(error => { throw new Error('Configuration migration source does not exist.', { cause: error }); });
  if (!sourceStats.isFile()) throw new Error('Configuration migration source must be a file.');
  const runtime = configureRuntimeData({ serverMode: 'production', appMode: 'household', runtimeDirectory: runtimeRoot });
  await preflightRuntimeData(runtime);
  let sourceValue: unknown;
  try { sourceValue = JSON.parse(await readFile(sourcePath, 'utf8')) as unknown; } catch { throw new Error('Configuration migration source is malformed.'); }
  const legacy = validateLegacyHouseholdConfig(sourceValue);
  const targetDirectory = join(runtimeRoot, RUNTIME_CONFIG_DIRECTORY);
  if (await exists(targetDirectory)) throw new Error('Runtime configuration target already exists; no files were changed.');
  const stagingDirectory = join(dirname(targetDirectory), `.${basename(targetDirectory)}.staging-${randomUUID()}`);
  const targetValue = { schemaVersion: 1 as const, ...legacy };
  try {
    await mkdir(stagingDirectory, { recursive: false });
    const stagingFile = join(stagingDirectory, HOUSEHOLD_CONFIG_FILE);
    await writeFile(stagingFile, `${JSON.stringify(targetValue, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    const written = validateHouseholdConfig(JSON.parse(await readFile(stagingFile, 'utf8')) as unknown);
    const { schemaVersion: _version, ...writtenLegacy } = written;
    if (canonical(legacy) !== canonical(writtenLegacy)) throw new Error('Configuration migration verification failed.');
    await rename(stagingDirectory, targetDirectory);
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
}
