import type { HouseholdConfig } from '../config/householdConfig.js';
import { KnowledgeError, record, text, timestamp, validateSubject, subjectKey, type Subject, type Provenance } from './familyKnowledgeSchema.js';

export const MEMORY_DOMAINS = ['FOOD','WORK','TRAVEL','SHOPPING','LEISURE','ENTERTAINMENT','HOME','FAMILY','RELIGION','CHARITY','OTHER'] as const;
export const MEMORY_PREDICATES = {
  PREFERENCE:'PREFERS', INTEREST:'INTERESTED_IN', VALUE:'VALUES', CONVENTION:'FAMILY_CONVENTION',
  RESPONSIBILITY:'RESPONSIBLE_FOR', DECISION:'CROSS_CUTTING_DECISION', PATTERN:'OBSERVED_TENDENCY', CONSTRAINT:'SUBJECT_CONSTRAINT',
} as const;
export type MemoryType = keyof typeof MEMORY_PREDICATES;
export type MemoryDomain = typeof MEMORY_DOMAINS[number];
export type MemoryValues = {
  PREFERENCE: { topic:string; choice:string; stance:'PREFER'|'AVOID' };
  INTEREST: { topic:string };
  VALUE: { principle:string };
  CONVENTION: { area:string; practice:string };
  RESPONSIBILITY: { area:string; role:'PRIMARY'|'SHARED'|'BACKUP' };
  DECISION: { area:string; decision:string; rationale:string; scope:'CROSS_CUTTING' };
  PATTERN: { topic:'FOOD_CHOICE'|'TRAVEL_CHOICE'|'SHOPPING_CHOICE'|'LEISURE_CHOICE'|'ENTERTAINMENT_CHOICE'|'HOME_PRACTICE'; tendency:string; interpretation:'TENDENCY_ONLY' };
  CONSTRAINT: { topic:string; rule:string; strength:'SOFT'|'HARD' };
};
export type MemoryContext = null | {
  occasion:'EVERYDAY'|'TRAVEL'|'CELEBRATION'|'SHOPPING'|'LEISURE';
  locationLabel:string|null;
  season:'SPRING'|'SUMMER'|'AUTUMN'|'WINTER'|null;
};
export type MemoryEvidence = { statement:string; observedAt:string|null };
export type FamilyMemory = { [K in MemoryType]: {
  id:string; type:K; subject:Subject;
  assertion:{ vocabularyVersion:1; domain:MemoryDomain; predicate:typeof MEMORY_PREDICATES[K]; value:MemoryValues[K] };
  context:MemoryContext; displayText:string;
  audience:'HOUSEHOLD'; sensitivity:'STANDARD'|'SENSITIVE';
  provenance:Omit<Provenance,'sourceStatement'> & { sourceStatement:string };
  evidence:MemoryEvidence[];
  lifecycle:'ACTIVE'|'SUPERSEDED'|'RETRACTED'|'EXPIRED';
  validFrom:string|null; validUntil:string|null; reviewAfter:string|null;
  createdAt:string; updatedAt:string; endedAt:string|null;
  supersedes:string|null; supersededBy:string|null;
} }[MemoryType];
export const MAX_MEMORIES = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function id(value:unknown): asserts value is string { if(typeof value!=='string'||!UUID.test(value))throw new KnowledgeError(); }
function timeOrNull(value:unknown):void { if(value!==null)timestamp(value); }
export function memoryType(value:unknown): asserts value is MemoryType {
  if(typeof value!=='string'||!Object.hasOwn(MEMORY_PREDICATES,value))throw new KnowledgeError('INVALID_MEMORY_TYPE');
}
export function memoryDomain(value:unknown): asserts value is MemoryDomain {
  if(!MEMORY_DOMAINS.includes(value as MemoryDomain))throw new KnowledgeError('INVALID_MEMORY_DOMAIN');
}
function validateContext(value:unknown):void {
  if(value===null)return;
  const c=record(value,['occasion','locationLabel','season']);
  if(!['EVERYDAY','TRAVEL','CELEBRATION','SHOPPING','LEISURE'].includes(c.occasion as string)||
    (c.locationLabel!==null&&!text(c.locationLabel,100))||
    (c.season!==null&&!['SPRING','SUMMER','AUTUMN','WINTER'].includes(c.season as string)))throw new KnowledgeError();
}
function validateValue(type:MemoryType, value:unknown):void {
  const fields:Record<MemoryType,string[]>={
    PREFERENCE:['topic','choice','stance'],INTEREST:['topic'],VALUE:['principle'],CONVENTION:['area','practice'],
    RESPONSIBILITY:['area','role'],DECISION:['area','decision','rationale','scope'],PATTERN:['topic','tendency','interpretation'],CONSTRAINT:['topic','rule','strength'],
  };
  const v=record(value,fields[type]);
  if(Object.values(v).some(item=>!text(item)))throw new KnowledgeError();
  if(type==='PREFERENCE'&&!['PREFER','AVOID'].includes(v.stance as string))throw new KnowledgeError();
  if(type==='RESPONSIBILITY'&&!['PRIMARY','SHARED','BACKUP'].includes(v.role as string))throw new KnowledgeError();
  if(type==='DECISION'&&v.scope!=='CROSS_CUTTING')throw new KnowledgeError();
  if(type==='CONSTRAINT'&&!['SOFT','HARD'].includes(v.strength as string))throw new KnowledgeError();
  if(type==='PATTERN'&&(!['FOOD_CHOICE','TRAVEL_CHOICE','SHOPPING_CHOICE','LEISURE_CHOICE','ENTERTAINMENT_CHOICE','HOME_PRACTICE'].includes(v.topic as string)||v.interpretation!=='TENDENCY_ONLY'))throw new KnowledgeError();
}
export function canonicalMemoryValue(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonicalMemoryValue).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>JSON.stringify(key)+':'+canonicalMemoryValue(item)).join(',')+'}';
  return JSON.stringify(value);
}
/** A declared semantic slot, never names/aliases, display text or fuzzy matching. */
export function memorySlot(memory:FamilyMemory):string {
  const value=memory.assertion.value as unknown as Record<string,string>;
  const topic=memory.type==='VALUE'?value.principle:('topic' in value?value.topic:value.area);
  return canonicalMemoryValue([subjectKey(memory.subject),memory.type,memory.assertion.domain,memory.assertion.predicate,memory.context,topic]);
}
export function sameMemoryFamily(a:FamilyMemory,b:FamilyMemory):boolean {
  return subjectKey(a.subject)===subjectKey(b.subject)&&a.type===b.type&&a.assertion.domain===b.assertion.domain&&a.assertion.predicate===b.assertion.predicate;
}
export function validateMemories(value:unknown, config?:HouseholdConfig):asserts value is FamilyMemory[] {
  if(!Array.isArray(value)||value.length>MAX_MEMORIES)throw new KnowledgeError('MEMORY_LIMIT');
  const memories=value as FamilyMemory[];
  for(const m of memories){
    record(m,['id','type','subject','assertion','context','displayText','audience','sensitivity','provenance','evidence','lifecycle','validFrom','validUntil','reviewAfter','createdAt','updatedAt','endedAt','supersedes','supersededBy']);
    id(m.id);memoryType(m.type);validateSubject(m.subject,config);
    record(m.assertion,['vocabularyVersion','domain','predicate','value']);memoryDomain(m.assertion.domain);
    if(m.assertion.vocabularyVersion!==1||m.assertion.predicate!==MEMORY_PREDICATES[m.type])throw new KnowledgeError('INVALID_MEMORY_PREDICATE');
    validateValue(m.type,m.assertion.value);validateContext(m.context);
    if(!text(m.displayText,300)||m.audience!=='HOUSEHOLD'||!['STANDARD','SENSITIVE'].includes(m.sensitivity))throw new KnowledgeError();
    const p=record(m.provenance,['origin','suppliedByMemberId','sourceStatement','recordedAt']);
    if(!['EXPLICIT','CONFIRMED'].includes(p.origin as string)||!text(p.sourceStatement,300))throw new KnowledgeError('INVALID_MEMORY_PROVENANCE');
    if(p.suppliedByMemberId!==null)validateSubject({kind:'MEMBER',memberId:p.suppliedByMemberId},config);
    timestamp(p.recordedAt);timestamp(m.createdAt);timestamp(m.updatedAt);timeOrNull(m.endedAt);
    timeOrNull(m.validFrom);timeOrNull(m.validUntil);timeOrNull(m.reviewAfter);
    if(m.provenance.recordedAt!==m.createdAt||m.updatedAt<m.createdAt||(m.validFrom&&m.validUntil&&m.validUntil<=m.validFrom)||
      !['ACTIVE','SUPERSEDED','RETRACTED','EXPIRED'].includes(m.lifecycle)||(m.lifecycle==='ACTIVE')!==(m.endedAt===null)||(m.endedAt&&m.endedAt!==m.updatedAt))throw new KnowledgeError();
    if(m.lifecycle==='EXPIRED'&&(!m.validUntil||!m.endedAt||m.endedAt<m.validUntil))throw new KnowledgeError('INVALID_MEMORY_EXPIRY');
    if(m.supersedes!==null)id(m.supersedes);if(m.supersededBy!==null)id(m.supersededBy);
    if((m.lifecycle==='SUPERSEDED')!==(m.supersededBy!==null))throw new KnowledgeError();
    if(!Array.isArray(m.evidence)||m.evidence.length>5||(m.type==='PATTERN'&&m.evidence.length===0))throw new KnowledgeError('INVALID_MEMORY_EVIDENCE');
    for(const evidence of m.evidence){record(evidence,['statement','observedAt']);if(!text(evidence.statement,300))throw new KnowledgeError();timeOrNull(evidence.observedAt);if(evidence.observedAt&&evidence.observedAt>m.createdAt)throw new KnowledgeError();}
  }
  const byId=new Map(memories.map(m=>[m.id,m]));if(byId.size!==memories.length)throw new KnowledgeError('DUPLICATE_MEMORY',409);
  const slots=new Map<string,FamilyMemory>();
  for(const m of memories){
    if(m.lifecycle==='ACTIVE'){
      const key=memorySlot(m),previous=slots.get(key);
      if(previous)throw new KnowledgeError(canonicalMemoryValue(previous.assertion.value)===canonicalMemoryValue(m.assertion.value)?'DUPLICATE_MEMORY':'CONFLICTING_MEMORY',409);
      slots.set(key,m);
    }
    for(const [link,reverse] of [['supersedes','supersededBy'],['supersededBy','supersedes']] as const){
      if(m[link]!==null){const target=byId.get(m[link]!);if(!target||target===m||target[reverse]!==m.id||!sameMemoryFamily(m,target)||(link==='supersedes'&&target.createdAt>m.createdAt))throw new KnowledgeError('INVALID_MEMORY_SUPERSESSION');}
    }
    const seen=new Set<string>();let node:FamilyMemory|undefined=m;
    while(node){if(seen.has(node.id))throw new KnowledgeError('INVALID_MEMORY_SUPERSESSION');seen.add(node.id);node=node.supersedes?byId.get(node.supersedes):undefined;}
  }
}
export function memoryApplicability(m:FamilyMemory,now:string):'HISTORICAL'|'NOT_YET_VALID'|'PAST_VALIDITY'|'IN_WINDOW' {
  if(m.lifecycle!=='ACTIVE')return 'HISTORICAL';
  if(m.validFrom&&m.validFrom>now)return 'NOT_YET_VALID';
  if(m.validUntil&&m.validUntil<=now)return 'PAST_VALIDITY';
  return 'IN_WINDOW';
}
export type MemoryQuery={subject:Subject;type:MemoryType|null;domain:MemoryDomain|null;lifecycle:FamilyMemory['lifecycle']|'ALL';limit:number;offset:number};
export function validateMemoryQuery(value:unknown,config:HouseholdConfig):MemoryQuery {
  const q=record(value,['subject','type','domain','lifecycle','limit','offset']);validateSubject(q.subject,config);
  if(q.type!==null)memoryType(q.type);if(q.domain!==null)memoryDomain(q.domain);
  if(!['ACTIVE','SUPERSEDED','RETRACTED','EXPIRED','ALL'].includes(q.lifecycle as string)||!Number.isInteger(q.limit)||Number(q.limit)<1||Number(q.limit)>100||!Number.isInteger(q.offset)||Number(q.offset)<0||Number(q.offset)>MAX_MEMORIES)throw new KnowledgeError('INVALID_MEMORY_QUERY');
  return q as MemoryQuery;
}
