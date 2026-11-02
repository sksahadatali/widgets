import { validateKnowledge, type Knowledge, type LegacyKnowledge } from '../knowledge/familyKnowledgeSchema.js';

export type FamilyKnowledgeEnvelope = Knowledge;
/** AI-1A migration output remains byte-compatible; upgrade only on an explicit mutation. */
export function emptyFamilyKnowledge(householdId: string): LegacyKnowledge {
  return validateKnowledge({ schemaVersion: 1, householdId, revision: 0, profiles: [], relationships: [], memories: [] }) as LegacyKnowledge;
}
export const validateFamilyKnowledgeEnvelope = validateKnowledge;
