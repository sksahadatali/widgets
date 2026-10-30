import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateHouseholdConfigV1 } from '../config/householdConfig.js';
import { LEGACY_RUNTIME_STORE_FILES } from '../config/runtimeData.js';
import { validateProductionRuntime } from '../runtime/runtimeRestoreValidation.js';

export type IdentityFinding = {
  severity: 'BLOCKER' | 'WARNING' | 'INFORMATION';
  code: 'INVALID_RUNTIME' | 'UNRESOLVED' | 'REFERENCES_CHECKED';
  location: string;
  memberId?: string;
};
export type IdentityPreflight = { findings: IdentityFinding[]; referencesChecked: number; canMigrate: boolean };

// Exact persisted reference field names only. Never interpret names, aliases,
// event titles, native provider identifiers or free text as member identities.
const REFERENCE_FIELDS = new Set([
  'ownerProfileId', 'recipientProfileId', 'profileId', 'actorProfileId',
  'requestedByProfileId', 'addedByProfileId', 'childProfileId',
]);
export async function preflightIdentityReferences(source: string): Promise<IdentityPreflight> {
  const findings: IdentityFinding[] = [];
  let referencesChecked = 0;
  try {
    await validateProductionRuntime(source, 2);
    const raw = JSON.parse(await readFile(join(source, 'config', 'household.json'), 'utf8'));
    const config = validateHouseholdConfigV1(raw, { allowUnresolvedReferences: true });
    if (config.household.members.some((member, index) => raw.household.members[index].id !== member.id)) throw new Error('NONCANONICAL_ID');
    const members = new Set(config.household.members.map(member => member.id));
    const check = (value: unknown, location: string) => {
      if (value === null || value === undefined || value === 'family') return;
      referencesChecked++;
      if (typeof value === 'string' && !members.has(value)) findings.push({ severity: 'WARNING', code: 'UNRESOLVED', location, memberId: value });
    };
    const visit = (value: unknown, location: string): void => {
      if (Array.isArray(value)) { value.forEach((item, index) => visit(item, `${location}[${index}]`)); return; }
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (REFERENCE_FIELDS.has(key)) check(child, `${location}.${key}`);
        else if (key === 'profileIds' && Array.isArray(child)) child.forEach((id, index) => check(id, `${location}.${key}[${index}]`));
        else visit(child, `${location}.${key}`);
      }
    };
    visit(config.calendar.sources.map(source => source.defaultProfileAssignment), 'calendar.sourceDefaults');
    for (const file of LEGACY_RUNTIME_STORE_FILES) {
      visit(JSON.parse(await readFile(join(source, 'data', file), 'utf8')), file);
    }
    findings.push({ severity: 'INFORMATION', code: 'REFERENCES_CHECKED', location: 'runtime' });
  } catch {
    // Do not include validator causes: private configuration values must not be
    // emitted by CLI diagnostics. The dedicated validator can locate bad fields.
    findings.push({ severity: 'BLOCKER', code: 'INVALID_RUNTIME', location: 'runtime' });
  }
  return { findings, referencesChecked, canMigrate: !findings.some(item => item.severity === 'BLOCKER') };
}
