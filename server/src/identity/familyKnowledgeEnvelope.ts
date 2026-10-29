import { HOUSEHOLD_ID_PATTERN } from '../config/householdConfig.js';

export type FamilyKnowledgeEnvelope = {
  schemaVersion: 1;
  householdId: string;
  revision: 0;
  profiles: never[];
  relationships: never[];
  memories: never[];
};
export function emptyFamilyKnowledge(householdId: string): FamilyKnowledgeEnvelope {
  return validateFamilyKnowledgeEnvelope({ schemaVersion: 1, householdId, revision: 0, profiles: [], relationships: [], memories: [] });
}
export function validateFamilyKnowledgeEnvelope(value: unknown): FamilyKnowledgeEnvelope {
  const v = value as FamilyKnowledgeEnvelope;
  const keys = ['schemaVersion', 'householdId', 'revision', 'profiles', 'relationships', 'memories'];
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length || Object.keys(v).some(key => !keys.includes(key)) ||
    v.schemaVersion !== 1 || typeof v.householdId !== 'string' || !HOUSEHOLD_ID_PATTERN.test(v.householdId) || v.revision !== 0 ||
    [v.profiles, v.relationships, v.memories].some(items => !Array.isArray(items) || items.length !== 0)) {
    throw new Error('FAMILY_KNOWLEDGE_ENVELOPE_INVALID');
  }
  return v;
}
