import { EXPECTED_RUNTIME_MANIFEST } from '../config/runtimeData.js';
import {
  RUNTIME_SNAPSHOT_FILES,
  type RuntimeSnapshotFile,
} from './runtimeSnapshotInventory.js';

export type RuntimeSnapshotManifest = {
  schemaVersion: 1;
  kind: 'eyos-runtime-snapshot';
  snapshotId: string;
  createdAt: string;
  source: {
    runtimeManifest: typeof EXPECTED_RUNTIME_MANIFEST;
    householdConfigSchemaVersion: 1;
  };
  consistency: {
    mode: 'offline';
    operationLockHeld: true;
  };
  files: Array<{
    path: RuntimeSnapshotFile;
    bytes: number;
    sha256: string;
  }>;
};

export const SNAPSHOT_ID_PATTERN = /^\d{8}T\d{6}\.\d{3}Z-[0-9a-f]{8}$/;

function exactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).length === keys.length &&
    Object.keys(record).every(key => keys.includes(key));
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function validateSnapshotManifest(value: unknown): RuntimeSnapshotManifest {
  const root = record(value);
  if (!root || !exactKeys(root, [
    'schemaVersion', 'kind', 'snapshotId', 'createdAt', 'source', 'consistency', 'files',
  ])) throw new Error('SNAPSHOT_MANIFEST_INVALID');
  if (
    root.schemaVersion !== 1 || root.kind !== 'eyos-runtime-snapshot' ||
    typeof root.snapshotId !== 'string' || !SNAPSHOT_ID_PATTERN.test(root.snapshotId) ||
    typeof root.createdAt !== 'string' || Number.isNaN(Date.parse(root.createdAt))
  ) throw new Error('SNAPSHOT_MANIFEST_INVALID');
  const expectedCreatedAt = `${root.snapshotId.slice(0, 4)}-${root.snapshotId.slice(4, 6)}-${root.snapshotId.slice(6, 8)}T${root.snapshotId.slice(9, 11)}:${root.snapshotId.slice(11, 13)}:${root.snapshotId.slice(13, 15)}.${root.snapshotId.slice(16, 19)}Z`;
  if (root.createdAt !== expectedCreatedAt) throw new Error('SNAPSHOT_MANIFEST_INVALID');
  const source = record(root.source);
  const runtime = record(source?.runtimeManifest);
  const consistency = record(root.consistency);
  if (
    !source || !exactKeys(source, ['runtimeManifest', 'householdConfigSchemaVersion']) ||
    source.householdConfigSchemaVersion !== 1 ||
    !runtime || !exactKeys(runtime, ['schemaVersion', 'kind', 'dataLayoutVersion']) ||
    runtime.schemaVersion !== 1 || runtime.kind !== 'eyos-household-runtime' || runtime.dataLayoutVersion !== 1 ||
    !consistency || !exactKeys(consistency, ['mode', 'operationLockHeld']) ||
    consistency.mode !== 'offline' || consistency.operationLockHeld !== true ||
    !Array.isArray(root.files) || root.files.length !== RUNTIME_SNAPSHOT_FILES.length
  ) throw new Error('SNAPSHOT_MANIFEST_INVALID');
  root.files.forEach((item, index) => {
    const file = record(item);
    if (
      !file || !exactKeys(file, ['path', 'bytes', 'sha256']) ||
      file.path !== RUNTIME_SNAPSHOT_FILES[index] ||
      !Number.isSafeInteger(file.bytes) || Number(file.bytes) < 0 ||
      typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256)
    ) throw new Error('SNAPSHOT_MANIFEST_INVALID');
  });
  return value as RuntimeSnapshotManifest;
}

export function createSnapshotId(now: Date, randomPart: string): string {
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace('Z', 'Z');
  return `${timestamp}-${randomPart.toLowerCase()}`;
}
