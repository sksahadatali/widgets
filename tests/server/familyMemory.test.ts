import './helpers/providerEnvironment.js';
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { readFile, writeFile, readdir, unlink, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Server } from 'node:http';
import { testRuntime } from './helpers/householdAccess.js';
import { createApp } from '../../server/src/app.js';
import { canonicalConfig, legacyConfig } from '../fixtures/canonicalIdentity.js';
import { updateMemberIdentityMetadata, setHouseholdConfigForTests } from '../../server/src/config/householdConfig.js';
import { configureRuntimeData } from '../../server/src/config/runtimeData.js';
import { AccessError, withHouseholdAccess, establishHouseholdAccess } from '../../server/src/access/householdAccess.js';
import { familyKnowledgeStore as store } from '../../server/src/knowledge/familyKnowledgeStore.js';
import { validateKnowledge, type Profile } from '../../server/src/knowledge/familyKnowledgeSchema.js';
import { MEMORY_PREDICATES, type MemoryType, type FamilyMemory } from '../../server/src/knowledge/familyMemorySchema.js';
import { validateProductionRuntime } from '../../server/src/runtime/runtimeRestoreValidation.js';
import { createRuntimeSnapshot } from '../../server/src/runtime/runtimeSnapshot.js';
import { verifyRuntimeSnapshot } from '../../server/src/runtime/runtimeSnapshotValidation.js';
import { restoreRuntime } from '../../server/src/runtime/runtimeRestore.js';

const values = {
  PREFERENCE:{topic:'drink',choice:'tea',stance:'PREFER'},INTEREST:{topic:'gardening'},VALUE:{principle:'kindness'},
  CONVENTION:{area:'entrance',practice:'remove shoes'},RESPONSIBILITY:{area:'household donations',role:'SHARED'},
  DECISION:{area:'household purchasing principle',decision:'repair first',rationale:'reduce waste',scope:'CROSS_CUTTING'},
  PATTERN:{topic:'FOOD_CHOICE',tendency:'often chooses soup',interpretation:'TENDENCY_ONLY'},
  CONSTRAINT:{topic:'food ingredient',rule:'avoid ingredient',strength:'SOFT'},
};
function memory(type:MemoryType='PREFERENCE',subject:unknown={kind:'HOUSEHOLD'}) {
  return { type,subject,assertion:{vocabularyVersion:1,domain:'HOME',predicate:MEMORY_PREDICATES[type],value:structuredClone(values[type])},context:null,
    displayText:`Explicit ${type.toLowerCase()}`,audience:'HOUSEHOLD',sensitivity:'STANDARD',provenance:{origin:'EXPLICIT',suppliedByMemberId:'adult-1',sourceStatement:'Explicitly supplied household statement'},
    evidence:type==='PATTERN'?[{statement:'Explicitly confirmed observation',observedAt:null}]:[],validFrom:null,validUntil:null,reviewAfter:null };
}
async function fixture(inactive=false) {
  let config=canonicalConfig(legacyConfig);if(inactive)config=updateMemberIdentityMetadata(config,'child-1',{lifecycle:'INACTIVE'});
  const f=await testRuntime(config),path=join(f.root,'data','family-knowledge.local.json');
  const run=<T>(fn:()=>T)=>withHouseholdAccess(f.context,fn);
  const bytes=()=>readFile(path,'utf8');const data=async()=>JSON.parse(await bytes());
  const create=(m:unknown,revision=0)=>run(()=>store.createMemory({expectedRevision:revision,memory:m}));
  return {...f,path,run,bytes,data,create};
}
const query=(extra:Record<string,unknown>={})=>({subject:{kind:'HOUSEHOLD'},type:null,domain:null,lifecycle:'ACTIVE',limit:100,offset:0,...extra});
async function rejectUnchanged(f:Awaited<ReturnType<typeof fixture>>,operation:()=>unknown,code?:string) {
  const primary=await f.bytes();const before=await readdir(join(f.root,'data'));
  const backup=await readFile(`${f.path}.bak`,'utf8').catch(()=>null);
  await assert.rejects(async()=>f.run(operation),code?{code}:undefined);
  assert.equal(await f.bytes(),primary);assert.deepEqual(await readdir(join(f.root,'data')),before);assert.equal(await readFile(`${f.path}.bak`,'utf8').catch(()=>null),backup);
}
let server:Server|undefined;
afterEach(async()=>{mock.timers.reset();if(server){await new Promise<void>(resolve=>server!.close(()=>resolve()));server=undefined;}setHouseholdConfigForTests(null,'demo');configureRuntimeData({serverMode:'development',appMode:'demo'});});
async function http(f:Awaited<ReturnType<typeof fixture>>,demo=false,missing=false) {
  if(demo){setHouseholdConfigForTests(null,'demo');configureRuntimeData({serverMode:'development',appMode:'demo'});}
  server=createApp({mode:'development',appMode:demo?'demo':'household',accessBoundary:{mode:demo?'demo':'household',...(!demo&&!missing?{context:f.context}:{}),audit:()=>{}}}).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server!.once('listening',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');return `http://127.0.0.1:${address.port}/api/family-knowledge`;
}
const json=(body:unknown)=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

describe('AI-1D explicit typed Memory',()=>{
  for(const type of Object.keys(values) as MemoryType[])it(`captures ${type} with structured authority, source and no inferred state`,async()=>{
    const f=await fixture();const input=memory(type);const result=await f.create(input);const saved=result.result as FamilyMemory;
    assert.equal(result.revision,1);assert.equal((await f.data()).schemaVersion,3);assert.equal(saved.lifecycle,'ACTIVE');assert.deepEqual(saved.assertion,input.assertion);
    assert.equal(saved.provenance.sourceStatement,input.provenance.sourceStatement);assert.equal(saved.provenance.recordedAt,saved.createdAt);assert.equal(saved.validFrom,null);
    assert.equal((await f.run(()=>store.memories(query({type})))).memories.length,1);validateKnowledge(await f.data(),f.config);
  });
  it('supports confirmed provenance, canonical Member subjects and inactive historical resolution',async()=>{
    const f=await fixture(true);const m=memory('INTEREST',{kind:'MEMBER',memberId:'child-1'});m.provenance.origin='CONFIRMED';await f.create(m);
    const result=await f.run(()=>store.memories(query({subject:{kind:'MEMBER',memberId:'child-1'}})));assert.equal(result.memories.length,1);assert.equal(result.memories[0].provenance.origin,'CONFIRMED');
    assert.deepEqual((await f.data()).profiles,[]);assert.deepEqual((await f.data()).relationships,[]);
  });
  it('rejects unknown subjects, aliases, names, Family and invented supplier identity',async()=>{
    const f=await fixture();for(const subject of [{kind:'PERSON'},{kind:'MEMBER',memberId:'family'},{kind:'MEMBER',memberId:'Child'},{kind:'MEMBER',memberId:'unknown'},{kind:'HOUSEHOLD',memberId:'adult-1'}])await rejectUnchanged(f,()=>store.createMemory({expectedRevision:0,memory:memory('VALUE',subject)}));
    const m=memory();m.provenance.suppliedByMemberId='unknown';await rejectUnchanged(f,()=>store.createMemory({expectedRevision:0,memory:m}));
  });
  it('rejects Memory-as-Profile, Graph, operational state, generic notes and arbitrary predicates/values',async()=>{
    const f=await fixture();const base=memory();
    for(const change of [{type:'FACT'},{type:'NOTE'},{type:'LANGUAGE'},{type:'PARENT_OF'},{assertion:{...base.assertion,domain:'CALENDAR'}},{assertion:{...base.assertion,predicate:'profile.language'}},{assertion:{...base.assertion,vocabularyVersion:99}},{assertion:{...base.assertion,value:{...base.assertion.value,eventId:'operational'}}},{permissions:['admin']},{projectId:'project'},{context:{anything:'free-form'}}])await rejectUnchanged(f,()=>store.createMemory({expectedRevision:0,memory:{...base,...change}}));
  });
  it('requires explicit/confirmed capture, meaningful retained source and HOUSEHOLD audience',async()=>{
    const f=await fixture(),base=memory();
    for(const change of [{provenance:{...base.provenance,origin:'INFERRED'}},{provenance:{...base.provenance,origin:'SYSTEM'}},{provenance:{...base.provenance,sourceStatement:null}},{provenance:{...base.provenance,sourceStatement:''}},{provenance:{...base.provenance,recordedAt:'2000-01-01T00:00:00.000Z'}},{audience:'PRIVATE'},{audience:'ADULTS'},{audience:'MEMBER'},{lifecycle:'ACTIVE'}])await rejectUnchanged(f,()=>store.createMemory({expectedRevision:0,memory:{...base,...change}}));
  });
  it('distinguishes soft and hard constraints without inferring either or granting permissions',async()=>{
    const f=await fixture();const soft=(await f.create(memory('CONSTRAINT'))).result as FamilyMemory;
    const hard=memory('CONSTRAINT');hard.assertion.value={...values.CONSTRAINT,strength:'HARD'} as any;
    await rejectUnchanged(f,()=>store.createMemory({expectedRevision:1,memory:hard}),'CONFLICTING_MEMORY');
    await rejectUnchanged(f,()=>store.createMemory({expectedRevision:1,memory:{...hard,provenance:{...hard.provenance,origin:'INFERRED'}}},soft.id),'INVALID_MEMORY_PROVENANCE');
    const changed=await f.run(()=>store.createMemory({expectedRevision:1,memory:hard},soft.id));assert.equal((changed.result as any).assertion.value.strength,'HARD');
    assert.equal(f.context.scope,'HOUSEHOLD');assert.equal((await f.data()).memories[0].lifecycle,'SUPERSEDED');
  });
  for(const role of ['PRIMARY','SHARED','BACKUP'])it(`stores ${role} responsibility as data only`,async()=>{
    const f=await fixture();const m=memory('RESPONSIBILITY');m.assertion.value={...values.RESPONSIBILITY,role} as any;await f.create(m);
    assert.equal((await f.data()).memories[0].assertion.value.role,role);assert.equal(f.context.scope,'HOUSEHOLD');
  });
  it('restricts decisions to durable cross-cutting scope',async()=>{
    const f=await fixture();const m=memory('DECISION');for(const scope of ['PROJECT','CALENDAR','OPERATIONAL'])await rejectUnchanged(f,()=>store.createMemory({expectedRevision:0,memory:{...m,assertion:{...m.assertion,value:{...values.DECISION,scope}}}}));
  });
  it('requires bounded supporting evidence for tendencies and rejects guarantees or personality/ability topics',async()=>{
    const f=await fixture(),base=memory('PATTERN');for(const change of [{evidence:[]},{evidence:Array(6).fill({statement:'Evidence',observedAt:null})},{evidence:[{statement:'Observation',observedAt:'2999-01-01T00:00:00.000Z'}]},{evidence:[{statement:'Observation',observedAt:null,eventId:'private'}]},{assertion:{...base.assertion,value:{...values.PATTERN,interpretation:'GUARANTEED'}}},{assertion:{...base.assertion,value:{...values.PATTERN,topic:'PERSONALITY'}}},{assertion:{...base.assertion,value:{...values.PATTERN,topic:'ABILITY'}}}])await rejectUnchanged(f,()=>store.createMemory({expectedRevision:0,memory:{...base,...change}}));
    const saved=(await f.create(base)).result as FamilyMemory;const read=await f.run(()=>store.memory(saved.id));assert.equal((read.memory.assertion.value as any).interpretation,'TENDENCY_ONLY');assert.deepEqual(read.memory.evidence,base.evidence);
  });
});

describe('AI-1D lifecycle, conflicts and deterministic reads',()=>{
  it('rejects duplicates/conflicting active semantic slots and preserves original records through supersession',async()=>{
    const f=await fixture(),base=memory();const first=(await f.create(base)).result as FamilyMemory;
    await rejectUnchanged(f,()=>store.createMemory({expectedRevision:1,memory:{...base,displayText:'Different display only'}}),'DUPLICATE_MEMORY');
    const next={...base,assertion:{...base.assertion,value:{topic:'drink',choice:'coffee',stance:'PREFER'}}};
    await rejectUnchanged(f,()=>store.createMemory({expectedRevision:1,memory:next}),'CONFLICTING_MEMORY');
    await rejectUnchanged(f,()=>store.createMemory({expectedRevision:1,memory:base},first.id),'NO_MEMORY_CHANGE');
    const second=(await f.run(()=>store.createMemory({expectedRevision:1,memory:next},first.id))).result as FamilyMemory;
    const data=await f.data();assert.equal(data.memories[0].lifecycle,'SUPERSEDED');assert.equal(data.memories[0].supersededBy,second.id);assert.equal(second.supersedes,first.id);assert.deepEqual(data.memories[0].provenance,first.provenance);
    await rejectUnchanged(f,()=>store.createMemory({expectedRevision:2,memory:next},first.id));
    await rejectUnchanged(f,()=>store.createMemory({expectedRevision:2,memory:memory('VALUE')},second.id));
  });
  it('uses structural context comparison and allows distinct explicit applicability contexts',async()=>{
    const f=await fixture(),base=memory();const c={occasion:'TRAVEL',locationLabel:'Venue',season:null};await f.create({...base,context:c});
    await rejectUnchanged(f,()=>store.createMemory({expectedRevision:1,memory:{...base,context:{season:null,locationLabel:'Venue',occasion:'TRAVEL'}}}),'DUPLICATE_MEMORY');
    await f.create({...base,context:{...c,occasion:'EVERYDAY'}},1);assert.equal((await f.data()).memories.length,2);
  });
  it('retracts once, retaining assertion/source/evidence and without repeat revision bumps',async()=>{
    const f=await fixture();const first=(await f.create(memory('PATTERN'))).result as FamilyMemory;
    await f.run(()=>store.endMemory(first.id,{expectedRevision:1},'RETRACTED'));const saved=(await f.data()).memories[0];assert.equal(saved.lifecycle,'RETRACTED');assert.deepEqual(saved.assertion,first.assertion);assert.deepEqual(saved.evidence,first.evidence);assert.deepEqual(saved.provenance,first.provenance);
    await rejectUnchanged(f,()=>store.endMemory(first.id,{expectedRevision:2},'RETRACTED'),'MEMORY_NOT_ACTIVE');
  });
  it('separates review from expiry, excludes elapsed validity on reads and expires only when due',async()=>{
    const f=await fixture();const start=Date.now();mock.timers.enable({apis:['Date'],now:start});const m={...memory(),reviewAfter:new Date(start-1000).toISOString(),validUntil:new Date(start+1000).toISOString()};const first=(await f.create(m)).result as FamilyMemory;
    await rejectUnchanged(f,()=>store.endMemory(first.id,{expectedRevision:1},'EXPIRED'),'MEMORY_NOT_DUE');assert.equal((await f.run(()=>store.memories(query()))).memories.length,1);
    mock.timers.tick(2000);const before=await f.bytes();assert.equal((await f.run(()=>store.memories(query()))).memories.length,0);assert.equal((await f.run(()=>store.memory(first.id))).memory.applicability,'PAST_VALIDITY');assert.equal(await f.bytes(),before);
    await f.run(()=>store.endMemory(first.id,{expectedRevision:1},'EXPIRED'));assert.equal((await f.data()).memories[0].lifecycle,'EXPIRED');assert.equal((await f.run(()=>store.memories(query({lifecycle:'EXPIRED'})))).memories.length,1);
    await rejectUnchanged(f,()=>store.endMemory(first.id,{expectedRevision:2},'EXPIRED'));
  });
  it('rejects early/undated expiry and already-expired captures; future validity is not a current assertion',async()=>{
    const f=await fixture();const saved=(await f.create(memory())).result as FamilyMemory;await rejectUnchanged(f,()=>store.endMemory(saved.id,{expectedRevision:1},'EXPIRED'),'MEMORY_NOT_DUE');
    await rejectUnchanged(f,()=>store.createMemory({expectedRevision:1,memory:{...memory('INTEREST'),validUntil:'2000-01-01T00:00:00.000Z'}}));
    const future={...memory('INTEREST'),validFrom:'2998-01-01T00:00:00.000Z',validUntil:'2999-01-01T00:00:00.000Z'};const next=(await f.create(future,1)).result as FamilyMemory;
    assert.equal((await f.run(()=>store.memory(next.id))).memory.applicability,'NOT_YET_VALID');assert.equal((await f.run(()=>store.memories(query({type:'INTEREST'})))).memories.length,0);
  });
  it('filters by explicit subject/type/domain/lifecycle with stable bounded pagination and no read writes',async()=>{
    const f=await fixture();for(const [i,type] of (['INTEREST','VALUE','CONVENTION'] as MemoryType[]).entries())await f.create(memory(type),i);
    const before=await f.bytes();const first=await f.run(()=>store.memories(query({limit:1,lifecycle:'ALL'})));const again=await f.run(()=>store.memories(query({limit:1,lifecycle:'ALL'})));assert.deepEqual(first,again);assert.equal(first.nextOffset,1);assert.equal(first.truncated,true);
    const second=await f.run(()=>store.memories(query({limit:1,offset:1,lifecycle:'ALL'})));assert.notEqual(first.memories[0].id,second.memories[0].id);
    assert.equal((await f.run(()=>store.memories(query({domain:'FOOD'})))).memories.length,0);assert.equal(await f.bytes(),before);
    for(const change of [{limit:101},{offset:-1},{subject:{kind:'MEMBER',memberId:'unknown'}},{domain:'TASKS'},{type:'FACT'},{lifecycle:'DELETED'}])await assert.rejects(async()=>f.run(()=>store.memories(query(change))));
  });
});

describe('AI-1D access, persistence and compatibility',()=>{
  it('serializes concurrent writes and rejects stale revisions without primary/backup changes',async()=>{
    const f=await fixture();const results=await Promise.allSettled([f.create(memory('VALUE')),f.create(memory('INTEREST'))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await f.data()).revision,1);
    await rejectUnchanged(f,()=>store.createMemory({expectedRevision:0,memory:memory('CONVENTION')}),'FAMILY_KNOWLEDGE_REVISION_CONFLICT');assert.equal(JSON.parse(await readFile(`${f.path}.bak`,'utf8')).schemaVersion,1);
  });
  it('shares revision serialization with Profile writes across separately issued valid capabilities',async()=>{
    const f=await fixture();const second=await establishHouseholdAccess();
    const results=await Promise.allSettled([f.create(memory('VALUE')),withHouseholdAccess(second,()=>store.createProfile({expectedRevision:0,subject:{kind:'HOUSEHOLD'}}))]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const data=await f.data();assert.equal(data.revision,1);assert.equal(data.profiles.length+data.memories.length,1);
  });
  it('preserves legacy AI-1C schema on reads/Profile mutations, upgrades only explicit Memory mutation and preserves all domains thereafter',async()=>{
    const f=await fixture();const before=await f.bytes();assert.deepEqual((await f.run(()=>store.memories(query()))).memories,[]);assert.equal(await f.bytes(),before);
    const profile=(await f.run(()=>store.createProfile({expectedRevision:0,subject:{kind:'HOUSEHOLD'}}))).result as Profile;assert.equal((await f.data()).schemaVersion,2);
    const schema2=await f.bytes();await f.run(()=>store.memories(query()));assert.equal(await f.bytes(),schema2);
    await f.create(memory('VALUE'),1);assert.equal((await f.data()).schemaVersion,3);
    await f.run(()=>store.addFact(profile.id,{expectedRevision:2,fact:{kind:'LANGUAGE',value:{code:'en'},audience:'HOUSEHOLD',sensitivity:'STANDARD',validFrom:null,validUntil:null,reviewAfter:null,provenance:{origin:'EXPLICIT',suppliedByMemberId:'adult-1',sourceStatement:null}}}));
    assert.equal((await f.data()).memories.length,1);assert.equal((await f.data()).profiles[0].facts.length,1);assert.equal((await f.data()).schemaVersion,3);
  });
  it('rejects direct calls before file access without capability and denies Demo',async()=>{
    const f=await fixture();await unlink(f.path);assert.throws(()=>store.memories(query()),AccessError);assert.throws(()=>store.createMemory({expectedRevision:0,memory:memory()}),AccessError);
    setHouseholdConfigForTests(null,'demo');configureRuntimeData({serverMode:'development',appMode:'demo'});assert.throws(()=>f.run(()=>store.memories(query())),AccessError);
  });
  it('denies missing/foreign HTTP context before changes and keeps error responses minimal',async()=>{
    const f=await fixture();const before=await f.bytes();const base=await http(f);const response=await fetch(`${base}/memories`,{...json({expectedRevision:0,memory:memory()}),headers:{'Content-Type':'application/json','X-EYOS-Household-ID':'foreign-private'}});assert.equal(response.status,403);assert.doesNotMatch(await response.text(),/foreign-private|hh_|Explicit/);assert.equal(await f.bytes(),before);
    const good=await fetch(`${base}/memories`,json({expectedRevision:0,memory:memory()}));assert.equal(good.status,201);const result=await good.json() as any;assert.equal((await fetch(`${base}/memories/${result.result.id}`)).status,200);
    const retract=await fetch(`${base}/memories/${result.result.id}/retract`,json({expectedRevision:1}));assert.equal(retract.status,200);
  });
  it('denies Demo HTTP query and mutation without exposing real Memory',async()=>{
    const f=await fixture();await f.create(memory());const before=await f.bytes();const base=await http(f,true);assert.equal((await fetch(`${base}/memories/query`,json(query()))).status,403);assert.equal((await fetch(`${base}/memories`,json({expectedRevision:1,memory:memory('VALUE')}))).status,403);assert.equal(await f.bytes(),before);
  });
  it('fails closed on foreign/corrupt primary and never selects backup data',async()=>{
    const f=await fixture();await f.create(memory());const valid=await f.data();for(const bad of [{...valid,householdId:'hh_00000000-0000-4000-8000-000000000099'},{...valid,memories:[{...valid.memories[0],subject:{kind:'MEMBER',memberId:'unknown'}}]},{...valid,schemaVersion:2}]){
      await writeFile(f.path,JSON.stringify(bad));await assert.rejects(async()=>f.run(()=>store.memories(query())),{code:'FAMILY_KNOWLEDGE_UNAVAILABLE'});await assert.rejects(()=>validateProductionRuntime(f.root));assert.equal(await f.bytes(),JSON.stringify(bad));
    }
  });
  it('validates lineage, expiry state, bounded records/evidence and the unchanged physical size cap',async()=>{
    const f=await fixture();await f.create(memory());const valid=await f.data(),m=valid.memories[0];for(const change of [{lifecycle:'EXPIRED',endedAt:m.createdAt},{supersedes:m.id},{lifecycle:'SUPERSEDED',supersededBy:null},{assertion:{...m.assertion,vocabularyVersion:2}},{subject:{kind:'MEMBER',memberId:'family'}}])assert.throws(()=>validateKnowledge({...valid,memories:[{...m,...change}]},f.config));
    assert.throws(()=>validateKnowledge({...valid,memories:Array(1001).fill(m)},f.config));
    const oversized=JSON.stringify(valid)+' '.repeat(2*1024*1024);await writeFile(f.path,oversized);await assert.rejects(async()=>f.run(()=>store.memory(m.id)));await assert.rejects(()=>validateProductionRuntime(f.root));assert.equal(await f.bytes(),oversized);
  });
  it('rejects an oversized candidate before publication, leaving primary and backup byte-identical',async()=>{
    const f=await fixture();await f.create(memory('INTEREST'));const data=await f.data(),template=data.memories[0];
    template.displayText='d'.repeat(300);template.provenance.sourceStatement='s'.repeat(300);template.evidence=Array.from({length:5},()=>({statement:'e'.repeat(300),observedAt:null}));
    data.memories=[];data.revision=1;
    // Add bounded records until the next one crosses the actual serialized cap.
    do {
      const i=data.memories.length;data.memories.push({...structuredClone(template),id:`00000000-0000-4000-8000-${(i+1).toString(16).padStart(12,'0')}`,assertion:{...structuredClone(template.assertion),value:{topic:`interest-${i}`}}});
    } while(Buffer.byteLength(JSON.stringify(data,null,2)+'\n')<=2*1024*1024);
    data.memories.pop();
    validateKnowledge(data,f.config);await writeFile(f.path,JSON.stringify(data,null,2)+'\n');await validateProductionRuntime(f.root);
    const input={...memory('INTEREST'),displayText:template.displayText,evidence:template.evidence,provenance:{origin:'EXPLICIT',suppliedByMemberId:'adult-1',sourceStatement:template.provenance.sourceStatement},assertion:{vocabularyVersion:1,domain:'HOME',predicate:'INTERESTED_IN',value:{topic:'n'.repeat(160)}}};
    await rejectUnchanged(f,()=>store.createMemory({expectedRevision:data.revision,memory:input}),'FAMILY_KNOWLEDGE_LIMIT');
  });
  it('round-trips populated Memory through native snapshot/restore and verifies unchanged AI-1C snapshots',async()=>{
    const f=await fixture(),backup=await mkdtemp(join(tmpdir(),'eyos-memory-backup-'));
    try{
      await f.run(()=>store.createProfile({expectedRevision:0,subject:{kind:'HOUSEHOLD'}}));const old=await createRuntimeSnapshot({runtimeRoot:f.root,backupRoot:backup});await verifyRuntimeSnapshot(old.snapshotPath);
      await f.create(memory('PATTERN'),1);const populated=await f.bytes();const snapshot=await createRuntimeSnapshot({runtimeRoot:f.root,backupRoot:backup});assert.equal((await verifyRuntimeSnapshot(snapshot.snapshotPath)).fileCount,10);
      const current=await f.data();await f.run(()=>store.endMemory(current.memories[0].id,{expectedRevision:2},'RETRACTED'));
      await restoreRuntime({runtimeRoot:f.root,backupRoot:backup,snapshotId:snapshot.snapshotId,confirmRestore:snapshot.snapshotId});assert.equal(await f.bytes(),populated);await validateProductionRuntime(f.root);await verifyRuntimeSnapshot(old.snapshotPath);
    }finally{await rm(backup,{recursive:true,force:true});}
  });
});
