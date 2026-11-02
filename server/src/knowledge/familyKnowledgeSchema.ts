import { validateMemories, type FamilyMemory } from './familyMemorySchema.js';
import type { HouseholdConfig } from '../config/householdConfig.js';
import { HOUSEHOLD_ID_PATTERN } from '../config/householdConfig.js';

export type Subject = { kind: 'HOUSEHOLD' } | { kind: 'MEMBER'; memberId: string };
export type FactValues = {
  LANGUAGE: { code: string };
  CITIZENSHIP: { countryCode: string };
  BIRTH_CONTEXT: { date: string | null; place: string | null };
  RELIGIOUS_IDENTITY: { tradition: string };
  ACTIVITY_PARTICIPATION: { activity: string; organization: string | null };
  MEMBERSHIP: { organization: string; membershipType: string | null };
  CHILDCARE_ASSOCIATION: { organization: string };
  CLOTHING_FIT: { garment: string; size: string; system: string | null };
};
export type Provenance = {
  origin: 'EXPLICIT' | 'CONFIRMED';
  suppliedByMemberId: string | null;
  sourceStatement: string | null;
  recordedAt: string;
};
export type Fact = { [K in keyof FactValues]: {
  id: string; kind: K; value: FactValues[K];
  audience: 'HOUSEHOLD'; sensitivity: 'STANDARD' | 'SENSITIVE';
  lifecycle: 'ACTIVE' | 'SUPERSEDED' | 'RETRACTED';
  validFrom: string | null; validUntil: string | null; reviewAfter: string | null;
  createdAt: string; updatedAt: string; endedAt: string | null;
  supersedes: string | null; supersededBy: string | null;
  provenance: Provenance;
} }[keyof FactValues];
export type Profile = { id: string; subject: Subject; createdAt: string; updatedAt: string; facts: Fact[] };
export type Relationship = {
  id: string; type: 'PARENT_OF' | 'GUARDIAN_OF' | 'SPOUSE_OF';
  fromMemberId: string; toMemberId: string;
  audience: 'HOUSEHOLD'; sensitivity: 'STANDARD' | 'SENSITIVE';
  lifecycle: 'ACTIVE' | 'RETRACTED';
  validFrom: string | null; validUntil: string | null;
  createdAt: string; updatedAt: string; endedAt: string | null; provenance: Provenance;
};
export type KnowledgeV2 = { schemaVersion: 2; householdId: string; revision: number; profiles: Profile[]; relationships: Relationship[]; memories: never[] };
export type KnowledgeV3 = Omit<KnowledgeV2, 'schemaVersion' | 'memories'> & { schemaVersion: 3; memories: FamilyMemory[] };
export type LegacyKnowledge = { schemaVersion: 1; householdId: string; revision: 0; profiles: never[]; relationships: never[]; memories: never[] };
export type Knowledge = KnowledgeV2 | KnowledgeV3 | LegacyKnowledge;
export const RELATIONSHIP_TYPES = ['PARENT_OF', 'GUARDIAN_OF', 'SPOUSE_OF'] as const;
export const MAX_KNOWLEDGE_BYTES = 2 * 1024 * 1024;
export const MAX_PROFILES = 100;
export const MAX_FACTS_PER_PROFILE = 100;
export const MAX_RELATIONSHIPS = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export class KnowledgeError extends Error {
  constructor(readonly code = 'FAMILY_KNOWLEDGE_INVALID', readonly status = 400) { super('Family Knowledge request is invalid.'); }
}
export function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) throw new KnowledgeError();
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 160): value is string { return typeof value === 'string' && value.length > 0 && value.length <= max && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value); }
function id(value: unknown): asserts value is string { if (typeof value !== 'string' || !UUID.test(value)) throw new KnowledgeError(); }
export function timestamp(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new KnowledgeError();
}
function nullableTime(value: unknown) { if (value !== null) timestamp(value); }
function member(value: unknown, config?: HouseholdConfig) {
  if (!text(value, 80) || value === 'family' || (config && !config.household.members.some(item => item.id === value))) throw new KnowledgeError('INVALID_KNOWLEDGE_REFERENCE');
}
export function validateSubject(value: unknown, config?: HouseholdConfig): Subject {
  const v = value as Subject;
  if (v?.kind === 'HOUSEHOLD') record(v, ['kind']);
  else if (v?.kind === 'MEMBER') { record(v, ['kind', 'memberId']); member(v.memberId, config); }
  else throw new KnowledgeError();
  return v;
}
function provenance(value: unknown, config?: HouseholdConfig): void {
  const v = record(value, ['origin', 'suppliedByMemberId', 'sourceStatement', 'recordedAt']);
  if (typeof v.origin !== 'string' || !['EXPLICIT', 'CONFIRMED'].includes(v.origin)) throw new KnowledgeError();
  if (v.suppliedByMemberId !== null) member(v.suppliedByMemberId, config);
  if (v.sourceStatement !== null && !text(v.sourceStatement, 300)) throw new KnowledgeError();
  timestamp(v.recordedAt);
}
export function validateFactValue(kind: unknown, value: unknown): void {
  const fields: Record<keyof FactValues, string[]> = {
    LANGUAGE: ['code'], CITIZENSHIP: ['countryCode'], BIRTH_CONTEXT: ['date', 'place'], RELIGIOUS_IDENTITY: ['tradition'],
    ACTIVITY_PARTICIPATION: ['activity', 'organization'], MEMBERSHIP: ['organization', 'membershipType'], CHILDCARE_ASSOCIATION: ['organization'], CLOTHING_FIT: ['garment', 'size', 'system'],
  };
  if (typeof kind !== 'string' || !Object.hasOwn(fields, kind)) throw new KnowledgeError();
  const v = record(value, fields[kind as keyof FactValues]);
  for (const [key, item] of Object.entries(v)) {
    const nullable = ['date', 'place', 'organization', 'membershipType', 'system'].includes(key) && kind !== 'CHILDCARE_ASSOCIATION' && kind !== 'MEMBERSHIP';
    if (!(nullable && item === null) && !(key === 'membershipType' && item === null) && !text(item, 160)) throw new KnowledgeError();
  }
  if (kind === 'LANGUAGE' && !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(String(v.code))) throw new KnowledgeError();
  if (kind === 'CITIZENSHIP' && !/^[A-Z]{2}$/.test(String(v.countryCode))) throw new KnowledgeError();
  if (kind === 'BIRTH_CONTEXT') {
    if (v.date === null && v.place === null) throw new KnowledgeError();
    if (v.date !== null && (typeof v.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.date) || !Number.isFinite(Date.parse(v.date)) || new Date(v.date).toISOString().slice(0,10) !== v.date)) throw new KnowledgeError();
  }
}
function metadata(v: Fact | Relationship, config?: HouseholdConfig): void {
  id(v.id); timestamp(v.createdAt); timestamp(v.updatedAt); nullableTime(v.endedAt);
  nullableTime(v.validFrom); nullableTime(v.validUntil);
  if (v.audience !== 'HOUSEHOLD' || !['STANDARD', 'SENSITIVE'].includes(v.sensitivity) || v.updatedAt < v.createdAt ||
    (v.validFrom && v.validUntil && v.validUntil <= v.validFrom) ||
    (v.lifecycle === 'ACTIVE') !== (v.endedAt === null) || (v.endedAt && v.endedAt !== v.updatedAt)) throw new KnowledgeError();
  provenance(v.provenance, config);
  if (v.provenance.recordedAt !== v.createdAt) throw new KnowledgeError();
}
export function relationshipKey(r: Pick<Relationship, 'type' | 'fromMemberId' | 'toMemberId'>): string {
  const ends = r.type === 'SPOUSE_OF' ? [r.fromMemberId,r.toMemberId].sort() : [r.fromMemberId,r.toMemberId];
  return JSON.stringify([r.type,...ends]);
}
export function subjectKey(subject: Subject): string { return subject.kind === 'HOUSEHOLD' ? 'HOUSEHOLD' : `MEMBER:${subject.memberId}`; }
function unique(values: string[]): void { if (new Set(values).size !== values.length) throw new KnowledgeError('DUPLICATE_KNOWLEDGE', 409); }
function canonicalValue(value: unknown): string {
  return JSON.stringify(value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b))) : value);
}
export function factKey(f: Pick<Fact, 'kind' | 'value'>): string { return `${f.kind}:${canonicalValue(f.value)}`; }
export function validateKnowledge(value: unknown, config?: HouseholdConfig): Knowledge {
  const v = record(value, ['schemaVersion','householdId','revision','profiles','relationships','memories']) as unknown as Knowledge;
  if (typeof v.householdId !== 'string' || !HOUSEHOLD_ID_PATTERN.test(v.householdId) || (config && v.householdId !== config.household.householdId)) throw new KnowledgeError('HOUSEHOLD_SCOPE_MISMATCH', 503);
  if (![v.profiles,v.relationships,v.memories].every(Array.isArray) || (v.schemaVersion !== 3 && v.memories.length !== 0)) throw new KnowledgeError();
  if (v.schemaVersion === 1) {
    if (v.revision !== 0 || v.profiles.length || v.relationships.length) throw new KnowledgeError();
    return v;
  }
  if ((v.schemaVersion !== 2 && v.schemaVersion !== 3) || !Number.isSafeInteger(v.revision) || v.revision < 0 || v.revision >= Number.MAX_SAFE_INTEGER || ((v.profiles.length || v.relationships.length || v.memories.length) && v.revision === 0) || v.profiles.length > MAX_PROFILES || v.relationships.length > MAX_RELATIONSHIPS) throw new KnowledgeError();
  for (const profile of v.profiles) {
    record(profile, ['id','subject','createdAt','updatedAt','facts']); id(profile.id); validateSubject(profile.subject, config);
    timestamp(profile.createdAt); timestamp(profile.updatedAt);
    if (profile.updatedAt < profile.createdAt || !Array.isArray(profile.facts) || profile.facts.length > MAX_FACTS_PER_PROFILE) throw new KnowledgeError();
    for (const fact of profile.facts) {
      record(fact, ['id','kind','value','audience','sensitivity','lifecycle','validFrom','validUntil','reviewAfter','createdAt','updatedAt','endedAt','supersedes','supersededBy','provenance']);
      metadata(fact, config); validateFactValue(fact.kind, fact.value); nullableTime(fact.reviewAfter);
      if (!['ACTIVE','SUPERSEDED','RETRACTED'].includes(fact.lifecycle)) throw new KnowledgeError();
      if (fact.supersedes !== null) id(fact.supersedes);
      if (fact.supersededBy !== null) id(fact.supersededBy);
      if ((fact.lifecycle === 'SUPERSEDED') !== (fact.supersededBy !== null)) throw new KnowledgeError();
      if (fact.createdAt < profile.createdAt || fact.updatedAt > profile.updatedAt) throw new KnowledgeError();
      for (const [link, reverse] of [['supersedes','supersededBy'],['supersededBy','supersedes']] as const) {
        if (fact[link] !== null) {
          const target = profile.facts.find(item => item.id === fact[link]);
          if (!target || target === fact || target.kind !== fact.kind || target[reverse] !== fact.id || (link === 'supersedes' && target.createdAt > fact.createdAt)) throw new KnowledgeError();
        }
      }
    }
    unique(profile.facts.map(f => f.id)); unique(profile.facts.filter(f => f.lifecycle === 'ACTIVE').map(factKey));
    // Supersession chains must be acyclic, even when records share a capture timestamp.
    for (const fact of profile.facts) { const visited = new Set<string>(); let node: Fact | undefined = fact;
      while (node) { if (visited.has(node.id)) throw new KnowledgeError(); visited.add(node.id); node = profile.facts.find(item => item.id === node!.supersedes); }
    }
  }
  unique(v.profiles.map(p => p.id)); unique(v.profiles.map(p => subjectKey(p.subject)));
  for (const r of v.relationships) {
    record(r, ['id','type','fromMemberId','toMemberId','audience','sensitivity','lifecycle','validFrom','validUntil','createdAt','updatedAt','endedAt','provenance']);
    metadata(r, config);
    if (!RELATIONSHIP_TYPES.includes(r.type) || !['ACTIVE','RETRACTED'].includes(r.lifecycle)) throw new KnowledgeError();
    member(r.fromMemberId, config); member(r.toMemberId, config);
    if (r.fromMemberId === r.toMemberId) throw new KnowledgeError();
  }
  unique(v.relationships.map(r => r.id)); unique(v.relationships.filter(r => r.lifecycle === 'ACTIVE').map(relationshipKey));
  // Explicit parent cycles are contradictory; neither classifications nor other edge types imply parenthood.
  const parents = v.relationships.filter(r => r.lifecycle === 'ACTIVE' && r.type === 'PARENT_OF');
  const completed = new Set<string>();
  const visiting = new Set<string>();
  const visit = (node: string): void => {
    if (visiting.has(node)) throw new KnowledgeError('CONFLICTING_RELATIONSHIP', 409);
    if (completed.has(node)) return;
    visiting.add(node);
    for (const edge of parents.filter(r => r.fromMemberId === node)) visit(edge.toMemberId);
    visiting.delete(node); completed.add(node);
  };
  for (const start of new Set(parents.map(r => r.fromMemberId))) visit(start);
  if (v.schemaVersion === 3) validateMemories(v.memories, config);
  return v;
}
