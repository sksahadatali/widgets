import { getHouseholdConfig, type HouseholdConfig } from '../config/householdConfig.js';
import { validateMemberContext } from '../access/memberContext.js';
import { requireHouseholdAccess } from '../access/householdAccess.js';
import { text, type Subject, type Fact, type Relationship, type Provenance } from '../knowledge/familyKnowledgeSchema.js';
import type { FamilyMemory, MemoryContext } from '../knowledge/familyMemorySchema.js';

export type Purpose = 'MEAL_PREFERENCES' | 'CLOTHING_SHOPPING' | 'FAMILY_RELATIONSHIPS';
export type SourceClass = 'IDENTITY' | 'PROFILE' | 'FAMILY_GRAPH' | 'FAMILY_MEMORY';
export type SourceState = 'AVAILABLE' | 'EMPTY' | 'STALE' | 'UNAVAILABLE' | 'TRUNCATED' | 'CONFLICTED';
export type ContextReason = 'REVIEW_DUE' | 'RECORD_LIMIT' | 'TRAVERSAL_LIMIT' | 'ITEM_BUDGET' | 'BYTE_BUDGET';
export type SourceSignal = { source: SourceClass; states: SourceState[] };
export class ContextError extends Error {
  constructor(readonly code: 'CONTEXT_REQUEST_INVALID' | 'CONTEXT_UNAVAILABLE' | 'CONTEXT_REVISION_CONFLICT', readonly status: 400 | 409 | 503, readonly sources: SourceSignal[] = []) {
    super(status === 400 ? 'Context request is invalid.' : status === 409 ? 'Context revision requirement was not met.' : 'Context is unavailable.');
  }
}
type Base = {
  version: 1; subject: Subject; subjectMode: 'CURRENT' | 'RETAINED_IDENTITY';
  activeProfile: string | null; applicability: MemoryContext;
  requireKnowledgeRevision?: number;
  budget: { maxItems: number; maxBytes: number };
};
export type ContextRequest = Base & (
  | { purpose: 'MEAL_PREFERENCES'; options: { includeHouseholdDefaults: boolean } }
  | { purpose: 'CLOTHING_SHOPPING'; options: { garment: string; system: string | null; includeHouseholdDefaults: boolean } }
  | { purpose: 'FAMILY_RELATIONSHIPS'; options: { relationshipTypes: Relationship['type'][]; direction: 'OUTGOING' | 'INCOMING' | 'BOTH'; depth: number } }
);
export type IdentityItem = { kind: 'HOUSEHOLD'; householdId: string; displayName: string } |
  { kind: 'MEMBER'; memberId: string; displayName: string; lifecycle: 'ACTIVE' | 'INACTIVE' };
type MinimalProvenance = Pick<Provenance, 'origin' | 'recordedAt'>;
type PickEach<T, K extends keyof T> = T extends unknown ? Pick<T, K> : never;
export type ProfileItem = PickEach<Fact, 'id' | 'kind' | 'value' | 'audience' | 'sensitivity' | 'lifecycle' | 'validFrom' | 'validUntil' | 'reviewAfter'> & { subject: Subject; provenance: MinimalProvenance };
export type GraphItem = Pick<Relationship, 'id' | 'type' | 'fromMemberId' | 'toMemberId' | 'audience' | 'sensitivity' | 'lifecycle' | 'validFrom' | 'validUntil'> & { provenance: MinimalProvenance };
export type MemoryItem = PickEach<FamilyMemory, 'id' | 'subject' | 'type' | 'assertion' | 'context' | 'audience' | 'sensitivity' | 'lifecycle' | 'validFrom' | 'validUntil' | 'reviewAfter'> & { provenance: MinimalProvenance; evidenceCount: number };
export type ContextItem = IdentityItem | ProfileItem | GraphItem | MemoryItem;
type Source<T, S extends SourceClass> = {
  source: S; states: SourceState[]; readAt: string; revision: number | null;
  completeness: 'COMPLETE_FOR_REQUEST' | 'BOUNDED'; items: T[]; reasons: ContextReason[];
};
export type ContextSourceResult = Source<IdentityItem, 'IDENTITY'> | Source<ProfileItem, 'PROFILE'> | Source<GraphItem, 'FAMILY_GRAPH'> | Source<MemoryItem, 'FAMILY_MEMORY'>;
export type ContextResponse = {
  version: 1; policyVersion: 1; householdId: string; purpose: Purpose; subject: Subject;
  subjectLifecycle: 'ACTIVE' | 'INACTIVE' | null; activeProfile: string | null;
  actor: { verification: 'UNVERIFIED'; actorId: null; actorRole: null }; device: null;
  asOf: string; timeZone: string; knowledgeRevision: number; consistency: 'SINGLE_KNOWLEDGE_REVISION';
  completion: 'COMPLETE' | 'PARTIAL'; sources: ContextSourceResult[];
  budget: { maxItems: number; maxBytes: number; returnedItems: number; serializedBytes: number };
};
export function invalid(): never { throw new ContextError('CONTEXT_REQUEST_INVALID', 400); }
export function exact(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const v = value as Record<string, unknown>;
  if (required.some(key => !Object.hasOwn(v, key)) || Object.keys(v).some(key => !required.includes(key) && !optional.includes(key))) return invalid();
  return v;
}
const integer = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
/** Live validation: canonical identity comes only from the already-issued runtime capability. */
export function validateContextRequest(input: unknown, config: HouseholdConfig = getHouseholdConfig()): ContextRequest {
  requireHouseholdAccess();
  const v = exact(input, ['version','purpose','subject','subjectMode','activeProfile','applicability','options'], ['requireKnowledgeRevision','budget']);
  if (v.version !== 1 || (typeof v.purpose!=='string'||!['MEAL_PREFERENCES','CLOTHING_SHOPPING','FAMILY_RELATIONSHIPS'].includes(v.purpose)) || (typeof v.subjectMode!=='string'||!['CURRENT','RETAINED_IDENTITY'].includes(v.subjectMode))) return invalid();
  const subject = exact(v.subject, (v.subject as Subject)?.kind === 'HOUSEHOLD' ? ['kind'] : ['kind','memberId']);
  if (subject.kind === 'MEMBER') validateMemberContext(subject.memberId, { historical: v.subjectMode === 'RETAINED_IDENTITY' });
  else if (subject.kind !== 'HOUSEHOLD') return invalid();
  if (v.activeProfile !== null) validateMemberContext(v.activeProfile, { family: true });
  if (v.applicability !== null) {
    const c = exact(v.applicability, ['occasion','locationLabel','season']);
    if (!['EVERYDAY','TRAVEL','CELEBRATION','SHOPPING','LEISURE'].includes(c.occasion as string) ||
      (c.locationLabel !== null && !text(c.locationLabel,100)) || (c.season !== null && !['SPRING','SUMMER','AUTUMN','WINTER'].includes(c.season as string))) return invalid();
  }
  if (Object.hasOwn(v,'requireKnowledgeRevision') && !integer(v.requireKnowledgeRevision,0,Number.MAX_SAFE_INTEGER-1)) return invalid();
  const budget = v.budget === undefined ? {} : exact(v.budget, [], ['maxItems','maxBytes']);
  if ((Object.hasOwn(budget,'maxItems') && !integer(budget.maxItems,1,40)) || (Object.hasOwn(budget,'maxBytes') && !integer(budget.maxBytes,4096,32768))) return invalid();
  if (v.purpose === 'MEAL_PREFERENCES') {
    const o=exact(v.options,['includeHouseholdDefaults']);if(typeof o.includeHouseholdDefaults!=='boolean')return invalid();
  } else if (v.purpose === 'CLOTHING_SHOPPING') {
    const o=exact(v.options,['garment','system','includeHouseholdDefaults']);
    if(subject.kind!=='MEMBER'||!text(o.garment)|| (o.system!==null&&!text(o.system)) || typeof o.includeHouseholdDefaults!=='boolean')return invalid();
  } else {
    const o=exact(v.options,['relationshipTypes','direction'],['depth']);
    if(subject.kind!=='MEMBER'||v.applicability!==null||!Array.isArray(o.relationshipTypes)||!o.relationshipTypes.length||o.relationshipTypes.length>3||new Set(o.relationshipTypes).size!==o.relationshipTypes.length||o.relationshipTypes.some(t=>!['PARENT_OF','GUARDIAN_OF','SPOUSE_OF'].includes(t))||!['OUTGOING','INCOMING','BOTH'].includes(o.direction as string)||(Object.hasOwn(o,'depth')&&!integer(o.depth,1,2)))return invalid();
  }
  // Own the plan; callers cannot change nested policy inputs while the primary is read.
  const result=structuredClone({...v,budget:{maxItems:budget.maxItems??40,maxBytes:budget.maxBytes??32768}}) as ContextRequest;
  if(result.purpose==='FAMILY_RELATIONSHIPS') {
    result.options.depth ??= 1;
    result.options.relationshipTypes.sort();
  }
  // Config is server-owned; no caller-provided configuration is projected.
  if(config.household.householdId!==requireHouseholdAccess().householdId)return invalid();
  return result;
}
