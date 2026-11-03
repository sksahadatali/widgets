import type { HouseholdConfig } from '../config/householdConfig.js';
import { queryGraph } from './familyGraph.js';
import { memoryApplicability, canonicalMemoryValue, type FamilyMemory } from './familyMemorySchema.js';
import { subjectKey, type Knowledge, type Fact, type Relationship, type Provenance } from './familyKnowledgeSchema.js';
import { ContextError, type ContextRequest, type ContextResponse, type ContextSourceResult, type ContextItem, type IdentityItem, type ProfileItem, type MemoryItem, type ContextReason } from '../context/contextContract.js';
import { purposeSources, memoryRelevant, PROFILE_LIMIT, MEMORY_LIMIT, GRAPH_LIMIT, HARD_RESPONSE_BYTES } from '../context/contextPolicies.js';

const compare = (a:string,b:string) => a<b?-1:a>b?1:0;
const minimalProvenance = (p:Provenance) => ({origin:p.origin,recordedAt:p.recordedAt});
const validNow = (record:Fact|Relationship, now:string) => record.lifecycle==='ACTIVE'&&(!record.validFrom||record.validFrom<=now)&&(!record.validUntil||record.validUntil>now);
const reviewed = (item:ContextItem,now:string) => 'reviewAfter' in item&&item.reviewAfter!==null&&item.reviewAfter<=now;
const memoryOrder = (a:FamilyMemory,b:FamilyMemory) => {
  const rank = (m:FamilyMemory) => m.type==='CONSTRAINT'?(m.assertion.value.strength==='HARD'?0:1):m.type==='PATTERN'?3:2;
  return rank(a)-rank(b)||compare(a.type,b.type)||compare(canonicalMemoryValue(a.assertion),canonicalMemoryValue(b.assertion))||compare(a.id,b.id);
};
function identity(config:HouseholdConfig, memberId?:string):IdentityItem {
  if(memberId===undefined)return {kind:'HOUSEHOLD',householdId:config.household.householdId,displayName:config.household.displayName};
  const member=config.household.members.find(m=>m.id===memberId)!;
  return {kind:'MEMBER',memberId:member.id,displayName:member.displayName,lifecycle:member.lifecycle};
}
function signal(source:ContextSourceResult, reason:ContextReason) {
  if(!source.reasons.includes(reason))source.reasons.push(reason);
}
/** Canonical byte count includes its own serializedBytes field; no value is shortened. */
function measure(response:ContextResponse):number {
  response.budget.returnedItems=response.sources.reduce((count,source)=>count+source.items.length,0);
  for(let i=0;i<10;i++) {
    const bytes=Buffer.byteLength(JSON.stringify(response));
    if(bytes===response.budget.serializedBytes)return bytes;
    response.budget.serializedBytes=bytes;
  }
  throw new ContextError('CONTEXT_UNAVAILABLE',503);
}
function refreshStates(response:ContextResponse):void {
  for(const source of response.sources) {
    source.states=source.states.filter(state=>state!=='STALE'&&state!=='TRUNCATED');
    source.reasons=source.reasons.filter(reason=>reason!=='REVIEW_DUE');
    if(source.items.some(item=>reviewed(item,response.asOf))) {source.states.push('STALE');signal(source,'REVIEW_DUE');}
    if(source.reasons.some(reason=>reason!=='REVIEW_DUE'))source.states.push('TRUNCATED');
    source.completeness=source.states.includes('TRUNCATED')?'BOUNDED':'COMPLETE_FOR_REQUEST';
  }
  response.completion=response.sources.some(source=>source.states.includes('TRUNCATED'))?'PARTIAL':'COMPLETE';
}
/** Pure projection over ONE already validated envelope. No I/O, mutation or inferred meaning. */
export function projectFamilyKnowledge(store:Knowledge, request:ContextRequest, config:HouseholdConfig, asOf:string):ContextResponse {
  const rootMemberId=request.subject.kind==='MEMBER'?request.subject.memberId:undefined;
  const sources=purposeSources(request.purpose).map(source=>({source,states:['EMPTY'],readAt:asOf,revision:source==='IDENTITY'?null:store.revision,completeness:'COMPLETE_FOR_REQUEST',items:[],reasons:[]})) as ContextSourceResult[];
  const identities=sources[0] as Extract<ContextSourceResult,{source:'IDENTITY'}>;
  identities.states=['AVAILABLE'];identities.items=[identity(config,request.subject.kind==='MEMBER'?request.subject.memberId:undefined)];
  const response:ContextResponse={version:1,policyVersion:1,householdId:config.household.householdId,purpose:request.purpose,subject:request.subject,
    subjectLifecycle:rootMemberId?config.household.members.find(m=>m.id===rootMemberId)!.lifecycle:null,
    activeProfile:request.activeProfile,actor:{verification:'UNVERIFIED',actorId:null,actorRole:null},device:null,asOf,timeZone:config.location.timezone,
    knowledgeRevision:store.revision,consistency:'SINGLE_KNOWLEDGE_REVISION',completion:'COMPLETE',sources,budget:{...request.budget,returnedItems:0,serializedBytes:0}};
  for(const source of sources) {
    if(source.source==='PROFILE'&&request.purpose==='CLOTHING_SHOPPING') {
      const candidates=(store.profiles.find(p=>subjectKey(p.subject)===subjectKey(request.subject))?.facts??[])
        .filter(f=>f.audience==='HOUSEHOLD'&&validNow(f,asOf)&&f.kind==='CLOTHING_FIT'&&f.value.garment===request.options.garment&&f.value.system===request.options.system)
        .sort((a,b)=>compare(canonicalMemoryValue(a.value),canonicalMemoryValue(b.value))||compare(a.id,b.id));
      if(candidates.length)source.states=['AVAILABLE'];
      if(candidates.length>PROFILE_LIMIT)signal(source,'RECORD_LIMIT');
      source.items=candidates.slice(0,PROFILE_LIMIT).map(f=>({id:f.id,subject:request.subject,kind:f.kind,value:f.value,audience:f.audience,sensitivity:f.sensitivity,lifecycle:f.lifecycle,validFrom:f.validFrom,validUntil:f.validUntil,reviewAfter:f.reviewAfter,provenance:minimalProvenance(f.provenance)} as ProfileItem));
    }
    if(source.source==='FAMILY_MEMORY') {
      const candidates=store.memories.filter(m=>m.audience==='HOUSEHOLD'&&memoryApplicability(m,asOf)==='IN_WINDOW'&&memoryRelevant(m,request)).sort(memoryOrder);
      if(candidates.length)source.states=['AVAILABLE'];
      if(candidates.length>MEMORY_LIMIT)signal(source,'RECORD_LIMIT');
      source.items=candidates.slice(0,MEMORY_LIMIT).map(m=>({id:m.id,type:m.type,subject:m.subject,assertion:m.assertion,context:m.context,audience:m.audience,sensitivity:m.sensitivity,lifecycle:m.lifecycle,validFrom:m.validFrom,validUntil:m.validUntil,reviewAfter:m.reviewAfter,provenance:minimalProvenance(m.provenance),evidenceCount:m.evidence.length} as MemoryItem));
    }
    if(source.source==='FAMILY_GRAPH'&&request.purpose==='FAMILY_RELATIONSHIPS'&&request.subject.kind==='MEMBER') {
      const root=request.subject.memberId;
      // An out-of-window/sensitive transitive edge must never bridge traversal.
      const eligible=store.relationships.filter(r=>r.audience==='HOUSEHOLD'&&validNow(r,asOf)&&(r.sensitivity==='STANDARD'||r.fromMemberId===root||r.toMemberId===root)).sort((a,b)=>compare(a.type,b.type)||compare(a.id,b.id));
      const graph=queryGraph({revision:store.revision,relationships:eligible},{memberId:root,...request.options,limit:GRAPH_LIMIT,includeRetracted:false},config);
      if(graph.relationships.length)source.states=['AVAILABLE'];
      if(graph.truncated)signal(source,'TRAVERSAL_LIMIT');
      source.items=graph.relationships.map(r=>({id:r.id,type:r.type,fromMemberId:r.fromMemberId,toMemberId:r.toMemberId,audience:r.audience,sensitivity:r.sensitivity,lifecycle:r.lifecycle,validFrom:r.validFrom,validUntil:r.validUntil,provenance:minimalProvenance(r.provenance)}));
      const endpoints=new Set(source.items.flatMap(r=>[r.fromMemberId,r.toMemberId]));endpoints.delete(root);
      identities.items.push(...[...endpoints].sort(compare).map(id=>identity(config,id)));
    }
  }
  refreshStates(response);
  // Remove whole trailing records, retaining prefix order and complete assertions.
  while(measure(response)>Math.min(request.budget.maxBytes,HARD_RESPONSE_BYTES)||response.budget.returnedItems>request.budget.maxItems) {
    const reason=response.budget.returnedItems>request.budget.maxItems?'ITEM_BUDGET':'BYTE_BUDGET';
    const source=[...sources].reverse().find(s=>s.source!=='IDENTITY'&&s.items.length);
    if(!source)throw new ContextError('CONTEXT_UNAVAILABLE',503);
    source.items.pop();signal(source,reason);
    if(source.source==='FAMILY_GRAPH') {
      const endpoints=new Set(source.items.flatMap(r=>[r.fromMemberId,r.toMemberId]));
      identities.items=identities.items.filter((item,index)=>index===0||item.kind==='MEMBER'&&endpoints.has(item.memberId));
    }
    refreshStates(response);
  }
  // Own the DTO: later in-process mutation cannot affect the read snapshot.
  return structuredClone(response);
}
