import './helpers/providerEnvironment.js';
import assert from 'node:assert/strict';
import { describe,it } from 'node:test';
import { contextFixture,request,memory,typedMemory,fact,edge,source,AS_OF,CAPTURED,subject,uuid } from './helpers/context.js';
import { retrieveContext } from '../../server/src/context/contextService.js';

const items=(result:any,name:string)=>source(result,name).items;
describe('AI-1E purpose contracts and narrowing',()=>{
  for(const purpose of ['MEAL_PREFERENCES','CLOTHING_SHOPPING','FAMILY_RELATIONSHIPS'])it(`supports only the ${purpose} version-1 policy`,async()=>{
    const f=await contextFixture();await f.write();const result=await f.retrieve(request(purpose));assert.equal(result.version,1);assert.equal(result.policyVersion,1);assert.equal(result.purpose,purpose);assert.equal(result.knowledgeRevision,17);
    assert.deepEqual(result.sources.map(s=>s.source),purpose==='MEAL_PREFERENCES'?['IDENTITY','FAMILY_MEMORY']:purpose==='CLOTHING_SHOPPING'?['IDENTITY','PROFILE','FAMILY_MEMORY']:['IDENTITY','FAMILY_GRAPH']);
  });
  for(const patch of [{version:2},{purpose:'MEAL_PLANNING'},{sources:['ALL']},{predicates:['ANY']},{actorId:'adult-1'},{actorRole:'admin'},{permissions:['all']},{access:{}},{confidence:1},{includeSensitive:true},{memoryTypes:['VALUE']},{profileKinds:['BIRTH_CONTEXT']},{subject:{kind:'HOUSEHOLD',memberId:'child-1'}},{applicability:{}},{applicability:{occasion:'EVERYDAY',season:null,locationLabel:null,extra:true}},{budget:{maxItems:0}},{budget:{maxItems:41}},{budget:{maxBytes:4095}},{budget:{maxBytes:32769}},{budget:{maxBytes:65537}},{budget:{maxItems:1.5}},{budget:{other:true}},{requireKnowledgeRevision:-1},{requireKnowledgeRevision:'17'},{requireKnowledgeRevision:1.5},{options:{includeHouseholdDefaults:false,source:'all'}}])it(`rejects forbidden/malformed fields ${JSON.stringify(patch)}`,async()=>{
    const f=await contextFixture();await assert.rejects(()=>f.retrieve(request('MEAL_PREFERENCES',patch)),{code:'CONTEXT_REQUEST_INVALID'});
  });
  it('requires a Member for clothing/relationships and validates graph options/default depth',async()=>{
    const f=await contextFixture();for(const purpose of ['CLOTHING_SHOPPING','FAMILY_RELATIONSHIPS'])await assert.rejects(()=>f.retrieve(request(purpose,{subject:{kind:'HOUSEHOLD'}})),{code:'CONTEXT_REQUEST_INVALID'});
    for(const options of [{relationshipTypes:['FRIEND_OF'],direction:'BOTH'},{relationshipTypes:['PARENT_OF','PARENT_OF'],direction:'BOTH'},{relationshipTypes:['PARENT_OF'],direction:'ALL'},{relationshipTypes:['PARENT_OF'],direction:'BOTH',depth:0},{relationshipTypes:['PARENT_OF'],direction:'BOTH',depth:3}])await assert.rejects(()=>f.retrieve(request('FAMILY_RELATIONSHIPS',{options})),{code:'CONTEXT_REQUEST_INVALID'});
    await f.write();assert.equal((await f.retrieve(request('FAMILY_RELATIONSHIPS'))).completion,'COMPLETE');
  });
  it('allows a canonical Household subject and only explicit Household defaults',async()=>{
    const f=await contextFixture();f.data.memories=[memory(1),memory(2,{subject:{kind:'HOUSEHOLD'}})];await f.write();
    assert.equal(items(await f.retrieve(),'FAMILY_MEMORY').length,1);
    assert.equal(items(await f.retrieve(request('MEAL_PREFERENCES',{options:{includeHouseholdDefaults:true}})),'FAMILY_MEMORY').length,2);
    assert.equal(items(await f.retrieve(request('MEAL_PREFERENCES',{subject:{kind:'HOUSEHOLD'}})),'FAMILY_MEMORY')[0].subject.kind,'HOUSEHOLD');
  });
});

describe('AI-1E minimised Profile and Memory context',()=>{
  it('matches exact garment/system, permits necessary sensitive fit and excludes unrelated descriptive facts',async()=>{
    const f=await contextFixture();f.data.profiles=[{id:uuid(901),subject,createdAt:CAPTURED,updatedAt:CAPTURED,facts:[fact(101,{sensitivity:'SENSITIVE'}),fact(102,{value:{garment:'shirt',size:'L',system:'EU'}}),fact(103,{value:{garment:'coat',size:'L',system:'UK'}}),fact(104,{kind:'BIRTH_CONTEXT',value:{date:'2015-01-01',place:'PRIVATE birth place'}}),fact(105,{kind:'LANGUAGE',value:{code:'fr'}})]}];await f.write();
    const r=await f.retrieve(request('CLOTHING_SHOPPING'));assert.equal(items(r,'PROFILE').length,1);assert.equal(items(r,'PROFILE')[0].sensitivity,'SENSITIVE');assert.equal(items(r,'PROFILE')[0].value.size,'size-101');assert.doesNotMatch(JSON.stringify(r),/birth place|2015-01-01|"fr"|suppliedBy|sourceStatement|aliases|memberType/);
    assert.equal(items(await f.retrieve(request('CLOTHING_SHOPPING',{options:{garment:'Shirt',system:'UK',includeHouseholdDefaults:false}})),'PROFILE').length,0);
  });
  it('uses structured domain/type/predicate, never display text, and retains hard/soft constraints and tendencies',async()=>{
    const f=await contextFixture();f.data.memories=[memory(1),typedMemory(2,'CONSTRAINT',{topic:'ingredient',rule:'avoid ingredient',strength:'HARD'},{sensitivity:'SENSITIVE'}),typedMemory(3,'CONSTRAINT',{topic:'temperature',rule:'warm',strength:'SOFT'}),typedMemory(4,'PATTERN',{topic:'FOOD_CHOICE',tendency:'often soup',interpretation:'TENDENCY_ONLY'},{evidence:[{statement:'PRIVATE evidence',observedAt:null}]}),typedMemory(5,'VALUE',{principle:'kindness'}),typedMemory(6,'RESPONSIBILITY',{area:'cooking',role:'PRIMARY'}),typedMemory(7,'INTEREST',{topic:'food'}),memory(8,{assertion:{vocabularyVersion:1,domain:'WORK',predicate:'PREFERS',value:{topic:'job',choice:'food',stance:'PREFER'}},displayText:'FOOD preference'}),memory(9,{sensitivity:'SENSITIVE'})];await f.write();
    const r=await f.retrieve(),mem=items(r,'FAMILY_MEMORY');assert.equal(mem.length,4);assert.equal(mem[0].assertion.value.strength,'HARD');assert.ok(mem.some((m:any)=>m.assertion.value.strength==='SOFT'));const pattern=mem.find((m:any)=>m.type==='PATTERN');assert.equal(pattern.assertion.value.interpretation,'TENDENCY_ONLY');assert.equal(pattern.evidenceCount,1);
    assert.doesNotMatch(JSON.stringify(r),/PRIVATE|displayText|sourceStatement|suppliedByMemberId|"evidence"|RESPONSIBILITY|"WORK"/);
  });
  it('retains FOOD conventions/cross-cutting decisions but does not infer context from prose',async()=>{
    const f=await contextFixture();f.data.memories=[typedMemory(1,'CONVENTION',{area:'dinner',practice:'eat together'}),typedMemory(2,'DECISION',{area:'ingredients',decision:'local first',rationale:'reduce transport',scope:'CROSS_CUTTING'})];await f.write();assert.deepEqual(new Set(items(await f.retrieve(),'FAMILY_MEMORY').map((m:any)=>m.type)),new Set(['CONVENTION','DECISION']));
  });
  it('exactly matches clothing Memory topics and does not leak sensitive/unrelated shopping Memory',async()=>{
    const f=await contextFixture();const shopping=(n:number,topic:string,patch:any={})=>memory(n,{assertion:{vocabularyVersion:1,domain:'SHOPPING',predicate:'PREFERS',value:{topic,choice:'cotton',stance:'PREFER'}},...patch});
    f.data.memories=[shopping(1,'shirt'),shopping(2,'Shirt'),shopping(3,'shirt',{sensitivity:'SENSITIVE',subject:{kind:'HOUSEHOLD'}}),shopping(4,'coat')];await f.write();assert.deepEqual(items(await f.retrieve(request('CLOTHING_SHOPPING',{options:{garment:'shirt',system:'UK',includeHouseholdDefaults:true}})),'FAMILY_MEMORY').map((m:any)=>m.id),[uuid(1)]);
  });
  it('selects unscoped plus exact applicability only; null is not a wildcard',async()=>{
    const f=await contextFixture();const c={occasion:'EVERYDAY',locationLabel:null,season:'WINTER'};f.data.memories=[memory(1),memory(2,{context:c}),memory(3,{context:{...c,season:'SUMMER'}})];await f.write();
    assert.equal(items(await f.retrieve(),'FAMILY_MEMORY').length,1);
    assert.equal(items(await f.retrieve(request('MEAL_PREFERENCES',{applicability:{season:'WINTER',locationLabel:null,occasion:'EVERYDAY'}})),'FAMILY_MEMORY').length,2);
  });
  it('uses one asOf for validity and review; never treats reviewAfter as expiry',async()=>{
    const f=await contextFixture();f.data.memories=[memory(1,{reviewAfter:AS_OF}),memory(2,{validFrom:'2026-11-04T00:00:00.000Z'}),memory(3,{validUntil:AS_OF}),memory(4,{lifecycle:'RETRACTED',endedAt:CAPTURED}),memory(5,{lifecycle:'EXPIRED',validUntil:CAPTURED,endedAt:CAPTURED})];
    f.data.profiles=[{id:uuid(901),subject,createdAt:CAPTURED,updatedAt:CAPTURED,facts:[fact(101,{reviewAfter:AS_OF}),fact(102,{validFrom:'2026-11-04T00:00:00.000Z'}),fact(103,{validUntil:AS_OF}),fact(104,{lifecycle:'RETRACTED',endedAt:CAPTURED})]}];await f.write();
    const r=await f.retrieve(request('CLOTHING_SHOPPING'));assert.equal(items(r,'PROFILE').length,1);assert.deepEqual(source(r,'PROFILE').states,['AVAILABLE','STALE']);assert.equal(items(await f.retrieve(),'FAMILY_MEMORY').length,1);assert.deepEqual(source(await f.retrieve(),'FAMILY_MEMORY').states,['AVAILABLE','STALE']);assert.equal(JSON.parse(await f.bytes()).memories[0].lifecycle,'ACTIVE');
  });
  it('excludes superseded historical assertions while retaining their current replacement',async()=>{
    const f=await contextFixture();f.data.memories=[memory(1,{lifecycle:'SUPERSEDED',supersededBy:uuid(2),endedAt:CAPTURED}),memory(2,{supersedes:uuid(1)})];await f.write();assert.deepEqual(items(await f.retrieve(),'FAMILY_MEMORY').map((m:any)=>m.id),[uuid(2)]);
  });
  it('does not interpret differing legitimate fit facts as a semantic conflict',async()=>{
    const f=await contextFixture();f.data.profiles=[{id:uuid(901),subject,createdAt:CAPTURED,updatedAt:CAPTURED,facts:[fact(101),fact(102)]}];await f.write();const r=await f.retrieve(request('CLOTHING_SHOPPING'));assert.equal(items(r,'PROFILE').length,2);assert.deepEqual(source(r,'PROFILE').states,['AVAILABLE']);
  });
});

describe('AI-1E explicit bounded Graph',()=>{
  it('respects direction/types, spouse symmetry and lifecycle without enriching discovered relatives',async()=>{
    const f=await contextFixture();f.data.relationships=[edge(),edge(502,{type:'GUARDIAN_OF'}),edge(503,{type:'SPOUSE_OF'}),edge(504,{type:'PARENT_OF',fromMemberId:'child-1',toMemberId:'adult-1',lifecycle:'RETRACTED',endedAt:CAPTURED})];f.data.memories=[memory()];f.data.profiles=[{id:uuid(901),subject,createdAt:CAPTURED,updatedAt:CAPTURED,facts:[fact()]}];await f.write();
    const get=(types:string[],direction:string)=>f.retrieve(request('FAMILY_RELATIONSHIPS',{options:{relationshipTypes:types,direction,depth:1}}));
    assert.equal(items(await get(['PARENT_OF'],'OUTGOING'),'FAMILY_GRAPH').length,0);assert.equal(items(await get(['PARENT_OF'],'INCOMING'),'FAMILY_GRAPH').length,1);assert.equal(items(await get(['SPOUSE_OF'],'OUTGOING'),'FAMILY_GRAPH').length,1);
    const r=await get(['GUARDIAN_OF'],'BOTH');assert.deepEqual(r.sources.map(s=>s.source),['IDENTITY','FAMILY_GRAPH']);assert.equal(items(r,'IDENTITY').length,2);assert.doesNotMatch(JSON.stringify(r),/actorRole":"(?!null)|permissions|sourceStatement|suppliedByMemberId/);
  });
  it('filters future/elapsed edges BEFORE traversal and blocks sensitive transitive bridges',async()=>{
    const f=await contextFixture({members:3});f.data.relationships=[edge(501,{fromMemberId:'child-1',toMemberId:'extra-0',validFrom:'2026-11-04T00:00:00.000Z'}),edge(502,{fromMemberId:'extra-0',toMemberId:'extra-1'}),edge(503,{fromMemberId:'child-1',toMemberId:'extra-2',validUntil:AS_OF}),edge(504,{fromMemberId:'extra-2',toMemberId:'adult-1'})];await f.write();
    const q=request('FAMILY_RELATIONSHIPS',{options:{relationshipTypes:['PARENT_OF'],direction:'BOTH',depth:2}});assert.equal(items(await f.retrieve(q),'FAMILY_GRAPH').length,0);
    f.data.relationships=[edge(501,{fromMemberId:'child-1',toMemberId:'extra-0',sensitivity:'SENSITIVE'}),edge(502,{fromMemberId:'extra-0',toMemberId:'extra-1',sensitivity:'SENSITIVE'}),edge(503,{fromMemberId:'extra-1',toMemberId:'extra-2'})];await f.write();assert.equal(items(await f.retrieve(q),'FAMILY_GRAPH').length,1);
  });
  it('bounds traversal and includes identities only for returned endpoints, including after caller truncation',async()=>{
    const f=await contextFixture({members:15});f.data.relationships=Array.from({length:15},(_,n)=>edge(501+n,{fromMemberId:'child-1',toMemberId:`extra-${n}`}));await f.write();
    const r=await f.retrieve(request('FAMILY_RELATIONSHIPS'));assert.equal(items(r,'FAMILY_GRAPH').length,12);assert.equal(items(r,'IDENTITY').length,13);assert.ok(source(r,'FAMILY_GRAPH').states.includes('TRUNCATED'));
    const tiny=await f.retrieve(request('FAMILY_RELATIONSHIPS',{budget:{maxItems:3}}));assert.equal(items(tiny,'FAMILY_GRAPH').length,1);assert.equal(items(tiny,'IDENTITY').length,2);assert.equal(tiny.budget.returnedItems,3);
  });
  it('marks depth boundary as truncated and advances only within the requested depth',async()=>{
    const f=await contextFixture({members:2});f.data.relationships=[edge(501,{fromMemberId:'child-1',toMemberId:'extra-0'}),edge(502,{fromMemberId:'extra-0',toMemberId:'extra-1'})];await f.write();
    const r=await f.retrieve(request('FAMILY_RELATIONSHIPS'));assert.equal(items(r,'FAMILY_GRAPH').length,1);assert.ok(source(r,'FAMILY_GRAPH').states.includes('TRUNCATED'));
    const two=await f.retrieve(request('FAMILY_RELATIONSHIPS',{options:{relationshipTypes:['PARENT_OF'],direction:'BOTH',depth:2}}));assert.equal(items(two,'FAMILY_GRAPH').length,2);assert.equal(two.completion,'COMPLETE');
  });
});

describe('AI-1E bounds, states and deterministic DTO',()=>{
  it('distinguishes valid EMPTY from unavailable and enforces record caps',async()=>{
    const f=await contextFixture();await f.write();assert.deepEqual(source(await f.retrieve(),'FAMILY_MEMORY').states,['EMPTY']);
    f.data.memories=Array.from({length:10},(_,n)=>memory(n+1,{reviewAfter:AS_OF}));f.data.profiles=[{id:uuid(901),subject,createdAt:CAPTURED,updatedAt:CAPTURED,facts:Array.from({length:6},(_,n)=>fact(101+n))}];await f.write();
    const r=await f.retrieve();assert.equal(items(r,'FAMILY_MEMORY').length,8);assert.deepEqual(source(r,'FAMILY_MEMORY').states,['AVAILABLE','STALE','TRUNCATED']);assert.equal(source(r,'FAMILY_MEMORY').completeness,'BOUNDED');assert.equal(r.completion,'PARTIAL');
    assert.equal(items(await f.retrieve(request('CLOTHING_SHOPPING')),'PROFILE').length,4);
  });
  it('enforces exact UTF-8 serialized byte budgets by removing whole assertions without changing their values',async()=>{
    const f=await contextFixture();f.data.memories=Array.from({length:8},(_,n)=>memory(n+1,{assertion:{vocabularyVersion:1,domain:'FOOD',predicate:'PREFERS',value:{topic:`${n}`+'茶'.repeat(150),choice:'食'.repeat(160),stance:'PREFER'}}}));await f.write();
    const r=await f.retrieve(request('MEAL_PREFERENCES',{budget:{maxBytes:4096}}));assert.ok(items(r,'FAMILY_MEMORY').length<8);assert.ok(source(r,'FAMILY_MEMORY').reasons.includes('BYTE_BUDGET'));assert.ok(Buffer.byteLength(JSON.stringify(r))<=4096);assert.equal(Buffer.byteLength(JSON.stringify(r)),r.budget.serializedBytes);
    for(const item of items(r,'FAMILY_MEMORY'))assert.deepEqual(item.assertion,f.data.memories.find(m=>m.id===item.id)!.assertion);
  });
  it('caller item budget preserves source availability/truncation when no assertion fits',async()=>{
    const f=await contextFixture();f.data.memories=[memory()];await f.write();const r=await f.retrieve(request('MEAL_PREFERENCES',{budget:{maxItems:1}}));assert.deepEqual(source(r,'FAMILY_MEMORY').states,['AVAILABLE','TRUNCATED']);assert.deepEqual(items(r,'FAMILY_MEMORY'),[]);assert.equal(r.budget.returnedItems,1);
  });
  it('is deterministic for same clock/state/request, independent of physical record order and context key order',async()=>{
    const f=await contextFixture();f.data.memories=[memory(3),memory(1),memory(2)];await f.write();const a=await f.retrieve();f.data.memories.reverse();await f.write();assert.deepEqual(await f.retrieve(),a);assert.equal(a.asOf,AS_OF);assert.equal(a.budget.serializedBytes,Buffer.byteLength(JSON.stringify(a)));
  });
  it('audits only fixed purpose/source/state/outcome/duration metadata and tolerates sink failure',async()=>{
    const f=await contextFixture();f.data.memories=[memory()];await f.write();const audit:any[]=[];
    await f.run(()=>retrieveContext(request(),{now:()=>new Date(AS_OF),audit:r=>audit.push(r)}));
    assert.deepEqual(Object.keys(audit[0]).sort(),['purpose','sources','outcome','durationMs'].sort());assert.equal(audit[0].outcome,'SUCCESS');assert.doesNotMatch(JSON.stringify(audit),/PRIVATE|hh_|child-1|adult-1|topic-|soup/);
    await f.run(()=>retrieveContext(request(),{audit:()=>{throw new Error('private sink');}}));
  });
});
