import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { HOUSEHOLD_ID_PATTERN, validateHouseholdConfig, validateHouseholdConfigV1, type HouseholdConfig } from '../config/householdConfig.js';
import { assertExternalRuntimePath, EXPECTED_RUNTIME_MANIFEST, isPathWithin, LEGACY_RUNTIME_STORE_FILES } from '../config/runtimeData.js';
import { emptyFamilyKnowledge } from '../identity/familyKnowledgeEnvelope.js';
import { preflightIdentityReferences, type IdentityPreflight } from '../identity/identityPreflight.js';
import { acquireRuntimeOperationLock, releaseRuntimeOperationLock, type RuntimeOperationLock } from './runtimeOperationLock.js';
import { readRuntimeRestoreJournal } from './runtimeRestoreJournal.js';
import { validateProductionRuntime, validateRestoredRuntime } from './runtimeRestoreValidation.js';
import { runtimeSnapshotFiles } from './runtimeSnapshotInventory.js';
import { verifyRuntimeSnapshot } from './runtimeSnapshotValidation.js';
import { flushCopiedFile } from './runtimeSnapshot.js';
import { flushDirectory } from './runtimeDurability.js';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const encode = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const exists = async (path: string) => Boolean(await lstat(path).catch(error => {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
  throw error;
}));
async function regular(path: string): Promise<void> {
  const stats = await lstat(path);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('IDENTITY_MIGRATION_UNSAFE_FILE');
}
async function fingerprint(source: string): Promise<string> {
  const files = await Promise.all(runtimeSnapshotFiles(2).map(async file => [file, hash(await readFile(join(source, file)))]));
  return hash(JSON.stringify(files));
}

type Journal = {
  schemaVersion: 1;
  kind: 'eyos-identity-migration';
  sourceFingerprint: string;
  anchorFingerprint: string | null;
  householdId: string;
  establishedAt: string;
};
export type IdentityMigrationOptions = {
  sourceRuntimePath?: string;
  sourceSnapshotPath?: string;
  targetRuntimePath: string;
  identityFromRuntimePath?: string;
  confirmNewHousehold?: boolean;
  confirmed: boolean;
  faultHook?: (point: 'journaled' | 'copied' | 'validated' | 'published') => void | Promise<void>;
};

/** Offline, additive migration. The source is never edited, even on failure.
 * The durable sibling journal is retained after success and binds retries to
 * exactly the same legacy content/identity anchor. A corrupt journal fails closed.
 */
export async function migrateRuntimeLayout2To3(options: IdentityMigrationOptions): Promise<IdentityPreflight & { householdId: string }> {
  if (!options.confirmed) throw new Error('IDENTITY_MIGRATION_CONFIRMATION_REQUIRED');
  if (Boolean(options.sourceRuntimePath) === Boolean(options.sourceSnapshotPath)) throw new Error('IDENTITY_MIGRATION_REQUIRES_ONE_SOURCE');
  if (!options.identityFromRuntimePath && (!options.confirmNewHousehold || options.sourceSnapshotPath)) throw new Error('IDENTITY_MIGRATION_IDENTITY_ANCHOR_REQUIRED');
  if (options.identityFromRuntimePath && options.confirmNewHousehold) throw new Error('IDENTITY_MIGRATION_AMBIGUOUS_IDENTITY');
  if (options.sourceSnapshotPath && (await verifyRuntimeSnapshot(options.sourceSnapshotPath)).dataLayoutVersion !== 2) throw new Error('IDENTITY_MIGRATION_EXPECTS_LAYOUT_2');
  const source = assertExternalRuntimePath(options.sourceRuntimePath ?? join(options.sourceSnapshotPath!, 'payload'));
  if (options.sourceRuntimePath && await exists(join(dirname(source), 'snapshot.json'))) throw new Error('IDENTITY_MIGRATION_USE_SNAPSHOT_OPTION');
  const target = assertExternalRuntimePath(options.targetRuntimePath);
  const parent = dirname(target);
  const parentReal = await realpath(parent);
  const targetReal = join(parentReal, basename(target));
  const sourceReal = await realpath(source);
  assertExternalRuntimePath(targetReal);
  if (isPathWithin(sourceReal, targetReal) || isPathWithin(targetReal, sourceReal)) throw new Error('IDENTITY_MIGRATION_PATH_OVERLAP');
  const anchorPath = options.identityFromRuntimePath ? assertExternalRuntimePath(options.identityFromRuntimePath) : null;
  if (anchorPath) {
    if (await exists(join(dirname(anchorPath), 'snapshot.json'))) throw new Error('IDENTITY_ANCHOR_REQUIRES_RUNTIME');
    const anchorReal = await realpath(anchorPath);
    if (isPathWithin(anchorReal, targetReal) || isPathWithin(targetReal, anchorReal)) throw new Error('IDENTITY_MIGRATION_PATH_OVERLAP');
  }
  const journalPath = join(parent, `.${basename(target)}.identity-migration.json`);
  const staging = join(parent, `.${basename(target)}.identity-staging`);
  const locks: RuntimeOperationLock[] = [];
  // Snapshot payloads are immutable inputs; never put an operation lock inside
  // a historical snapshot. Verify their checksums again before publishing.
  const lockRoots = [...new Set([...(options.sourceRuntimePath ? [source] : []), ...(anchorPath ? [anchorPath] : []), target])].sort();
  try {
    for (const root of lockRoots) {
      if (await readRuntimeRestoreJournal(root)) throw new Error('RESTORE_RECOVERY_REQUIRED');
      locks.push(await acquireRuntimeOperationLock({ runtimeRoot: root, operation: 'migration' }));
    }
    const preflight = await preflightIdentityReferences(source);
    if (!preflight.canMigrate) throw new Error('IDENTITY_PREFLIGHT_BLOCKED');
    const original = JSON.parse(await readFile(join(source, 'config', 'household.json'), 'utf8'));
    const legacy = validateHouseholdConfigV1(original, { allowUnresolvedReferences: true });
    if (legacy.household.members.some((member, i) => member.id !== original.household.members[i].id)) throw new Error('IDENTITY_PREFLIGHT_NONCANONICAL_ID');
    let anchor: HouseholdConfig | null = null;
    if (anchorPath) {
      await validateProductionRuntime(anchorPath);
      anchor = validateHouseholdConfig(JSON.parse(await readFile(join(anchorPath, 'config', 'household.json'), 'utf8')));
      // Existing identities are authoritative during a legacy restore. Never
      // guess that an unknown legacy member is a renamed current member.
      if (legacy.household.members.some(member => !anchor!.household.members.some(current => current.id === member.id))) throw new Error('IDENTITY_ANCHOR_MISSING_LEGACY_MEMBER');
    }
    const sourceFingerprint = await fingerprint(source);
    const anchorFingerprint = anchor ? hash(JSON.stringify(anchor.household)) : null;
    let journal: Journal;
    if (await exists(journalPath)) {
      await regular(journalPath);
      journal = JSON.parse(await readFile(journalPath, 'utf8')) as Journal;
      if (Object.keys(journal).sort().join() !== ['schemaVersion', 'kind', 'sourceFingerprint', 'anchorFingerprint', 'householdId', 'establishedAt'].sort().join() ||
        journal.schemaVersion !== 1 || journal.kind !== 'eyos-identity-migration' ||
        typeof journal.householdId !== 'string' || !HOUSEHOLD_ID_PATTERN.test(journal.householdId) ||
        typeof journal.establishedAt !== 'string' || !Number.isFinite(Date.parse(journal.establishedAt)) || new Date(journal.establishedAt).toISOString() !== journal.establishedAt ||
        journal.sourceFingerprint !== sourceFingerprint || journal.anchorFingerprint !== anchorFingerprint ||
        (anchor && journal.householdId !== anchor.household.householdId)) throw new Error('IDENTITY_MIGRATION_JOURNAL_MISMATCH');
    } else {
      if (await exists(target) || await exists(staging)) throw new Error('IDENTITY_MIGRATION_UNOWNED_TARGET');
      journal = { schemaVersion: 1, kind: 'eyos-identity-migration', sourceFingerprint, anchorFingerprint,
        householdId: anchor?.household.householdId ?? `hh_${randomUUID()}`, establishedAt: new Date().toISOString() };
      // Exclusive creation: a partial/corrupt journal is never silently replaced
      // or used to mint another identity. Recovery must retain this evidence.
      await writeFile(journalPath, encode(journal), { flag: 'wx', mode: 0o600 });
      await flushCopiedFile(journalPath);
      await flushDirectory(parent);
    }
    const migrated = validateHouseholdConfig({ ...legacy, schemaVersion: 2, household: anchor?.household ?? {
      ...legacy.household, householdId: journal.householdId,
      members: legacy.household.members.map(member => ({ ...member, lifecycle: 'ACTIVE', aliases: [], createdAt: journal.establishedAt, inactiveAt: null })),
    } });
    const generated: Record<string, string> = {
      'runtime.json': encode(EXPECTED_RUNTIME_MANIFEST),
      'config/household.json': encode(migrated),
      'data/family-knowledge.local.json': encode(emptyFamilyKnowledge(migrated.household.householdId)),
    };
    const verifyTarget = async (root: string) => {
      await validateRestoredRuntime(root);
      for (const [file, bytes] of Object.entries(generated)) {
        if (hash(await readFile(join(root, file))) !== hash(bytes)) throw new Error('IDENTITY_MIGRATION_TARGET_CHANGED');
      }
      for (const file of LEGACY_RUNTIME_STORE_FILES) {
        if (hash(await readFile(join(root, 'data', file))) !== hash(await readFile(join(source, 'data', file)))) throw new Error('IDENTITY_MIGRATION_CHECKSUM_MISMATCH');
      }
    };
    if (await exists(target)) {
      await verifyTarget(target);
      return { ...preflight, householdId: migrated.household.householdId };
    }
    await options.faultHook?.('journaled');
    if (await exists(staging)) {
      const stats = await lstat(staging);
      if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('IDENTITY_MIGRATION_UNSAFE_STAGING');
      await rm(staging, { recursive: true });
    }
    await mkdir(staging, { mode: 0o700 });
    await mkdir(join(staging, 'config'), { mode: 0o700 });
    await mkdir(join(staging, 'data'), { mode: 0o700 });
    for (const file of LEGACY_RUNTIME_STORE_FILES) {
      const to = join(staging, 'data', file);
      await copyFile(join(source, 'data', file), to, constants.COPYFILE_EXCL);
      await flushCopiedFile(to);
    }
    for (const [file, bytes] of Object.entries(generated)) {
      const to = join(staging, file);
      await writeFile(to, bytes, { flag: 'wx', mode: 0o600 });
      await flushCopiedFile(to);
    }
    await options.faultHook?.('copied');
    await verifyTarget(staging);
    if (await fingerprint(source) !== journal.sourceFingerprint) throw new Error('IDENTITY_MIGRATION_SOURCE_CHANGED');
    if (options.sourceSnapshotPath) await verifyRuntimeSnapshot(options.sourceSnapshotPath);
    await flushDirectory(join(staging, 'config'));
    await flushDirectory(join(staging, 'data'));
    await flushDirectory(staging);
    await options.faultHook?.('validated');
    await rename(staging, target);
    await flushDirectory(parent);
    await options.faultHook?.('published');
    await verifyTarget(target);
    return { ...preflight, householdId: migrated.household.householdId };
  } finally {
    for (const lock of locks.reverse()) await releaseRuntimeOperationLock(lock);
  }
}
