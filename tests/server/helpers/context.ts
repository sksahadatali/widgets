import { afterEach } from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { testRuntime } from './householdAccess.js';
import { canonicalConfig, legacyConfig } from '../../fixtures/canonicalIdentity.js';
import { configureRuntimeData } from '../../../server/src/config/runtimeData.js';
import { setHouseholdConfigForTests, updateMemberIdentityMetadata } from '../../../server/src/config/householdConfig.js';
import { withHouseholdAccess } from '../../../server/src/access/householdAccess.js';
import { retrieveContext } from '../../../server/src/context/contextService.js';
import { validateKnowledge, type KnowledgeV3, type Fact, type Relationship } from '../../../server/src/knowledge/familyKnowledgeSchema.js';
import { MEMORY_PREDICATES, type FamilyMemory } from '../../../server/src/knowledge/familyMemorySchema.js';
export const AS_OF='2026-11-03T12:00:00.000Z';
export const CAPTURED='2026-10-29T00:00:00.000Z';
export const uuid=(n:number)=>`00000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`;
const provenance={origin:'EXPLICIT' as const,suppliedByMemberId:'adult-1',sourceStatement:'PRIVATE source statement',recordedAt:CAPTURED};
const meta={audience:'HOUSEHOLD' as const,sensitivity:'STANDARD' as const,lifecycle:'ACTIVE' as const,validFrom:null,validUntil:null,createdAt:CAPTURED,updatedAt:CAPTURED,endedAt:null,provenance};
export const subject={kind:'MEMBER' as const,memberId:'child-1'};
export function memory(n=1,patch:Record<string,unknown>={}):FamilyMemory {
  return {id:uuid(n),...meta,type:'PREFERENCE',subject,assertion:{vocabularyVersion:1,domain:'FOOD',predicate:'PREFERS',value:{topic:`topic-${n}`,choice:'soup',stance:'PREFER'}},context:null,displayText:'PRIVATE display text',reviewAfter:null,evidence:[],supersedes:null,supersededBy:null,...patch} as FamilyMemory;
}
export function typedMemory(n:number,type:FamilyMemory['type'],value:unknown,patch:Record<string,unknown>={}) {
  return memory(n,{type,assertion:{vocabularyVersion:1,domain:'FOOD',predicate:MEMORY_PREDICATES[type],value},...patch});
}
export const fact=(n=101,patch:Record<string,unknown>={}):Fact=>({id:uuid(n),...meta,kind:'CLOTHING_FIT',value:{garment:'shirt',size:`size-${n}`,system:'UK'},reviewAfter:null,supersedes:null,supersededBy:null,...patch}) as Fact;
export const edge=(n=501,patch:Record<string,unknown>={}):Relationship=>({id:uuid(n),...meta,type:'PARENT_OF',fromMemberId:'adult-1',toMemberId:'child-1',...patch}) as Relationship;
export function request(purpose='MEAL_PREFERENCES',patch:Record<string,unknown>={}):any {
  return {version:1,purpose,subject:structuredClone(subject),subjectMode:'CURRENT',activeProfile:'family',applicability:null,
    options:purpose==='MEAL_PREFERENCES'?{includeHouseholdDefaults:false}:purpose==='CLOTHING_SHOPPING'?{garment:'shirt',system:'UK',includeHouseholdDefaults:false}:{relationshipTypes:['PARENT_OF','GUARDIAN_OF','SPOUSE_OF'],direction:'BOTH'},...patch};
}
export async function contextFixture(options:{inactive?:boolean;members?:number}={}) {
  let config=canonicalConfig(legacyConfig);
  for(let n=0;n<(options.members??0);n++)config.household.members.push({...config.household.members[1],id:`extra-${n}`,displayName:`Extra ${n}`});
  config.household.members[1].aliases=['Nickname'];
  if(options.inactive)config=updateMemberIdentityMetadata(config,'child-1',{lifecycle:'INACTIVE'});
  const f=await testRuntime(config),path=join(f.root,'data','family-knowledge.local.json');
  const data:KnowledgeV3={schemaVersion:3,householdId:config.household.householdId,revision:17,profiles:[],relationships:[],memories:[]};
  const write=async(value:unknown=data)=>{validateKnowledge(value,config);await writeFile(path,JSON.stringify(value));};
  const run=<T>(fn:()=>T)=>withHouseholdAccess(f.context,fn);
  const retrieve=(input:unknown=request())=>run(()=>retrieveContext(input,{now:()=>new Date(AS_OF),audit:()=>{}}));
  const bytes=()=>readFile(path,'utf8');
  return {...f,path,data,write,run,retrieve,bytes};
}
export function source(response:Awaited<ReturnType<typeof retrieveContext>>,name:string):any {return response.sources.find(s=>s.source===name)!;}
afterEach(()=>{setHouseholdConfigForTests(null,'demo');configureRuntimeData({serverMode:'development',appMode:'demo'});});
