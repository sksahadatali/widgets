import './helpers/providerEnvironment.js';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { readFile, writeFile, readdir, unlink, symlink, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { testRuntime } from './helpers/householdAccess.js';
import { createApp } from '../../server/src/app.js';
import { canonicalConfig, legacyConfig } from '../fixtures/canonicalIdentity.js';
import { configureRuntimeData } from '../../server/src/config/runtimeData.js';
import { setHouseholdConfigForTests, updateMemberIdentityMetadata } from '../../server/src/config/householdConfig.js';
import { AccessError, withHouseholdAccess, establishHouseholdAccess } from '../../server/src/access/householdAccess.js';
import { validateKnowledge, KnowledgeError, type KnowledgeV2, type Profile, type Fact, type Relationship } from '../../server/src/knowledge/familyKnowledgeSchema.js';
import { familyKnowledgeStore as store } from '../../server/src/knowledge/familyKnowledgeStore.js';
import { validateProductionRuntime } from '../../server/src/runtime/runtimeRestoreValidation.js';
import { createRuntimeSnapshot } from '../../server/src/runtime/runtimeSnapshot.js';
import { verifyRuntimeSnapshot } from '../../server/src/runtime/runtimeSnapshotValidation.js';
import { restoreRuntime } from '../../server/src/runtime/runtimeRestore.js';

const provenance = { origin:'EXPLICIT', suppliedByMemberId:'adult-1', sourceStatement:null };
const fact = (kind='LANGUAGE',value:unknown={code:'en'}) => ({ kind,value,audience:'HOUSEHOLD',sensitivity:'STANDARD',validFrom:null,validUntil:null,reviewAfter:null,provenance });
const relationship = (type='PARENT_OF',fromMemberId='adult-1',toMemberId='child-1') => ({type,fromMemberId,toMemberId,audience:'HOUSEHOLD',sensitivity:'STANDARD',validFrom:null,validUntil:null,provenance});
async function fixture(inactive=false) {
  let config=canonicalConfig(legacyConfig);
  if(inactive)config=updateMemberIdentityMetadata(config,'child-1',{lifecycle:'INACTIVE'});
  const f=await testRuntime(config);const path=join(f.root,'data','family-knowledge.local.json');
  const run=<T>(operation:()=>T)=>withHouseholdAccess(f.context,operation);
  const bytes=()=>readFile(path,'utf8');
  const data=async()=>JSON.parse(await bytes()) as KnowledgeV2;
  return {...f,path,run,bytes,data};
}
let server:Server|undefined;
afterEach(async()=>{if(server){await new Promise<void>(resolve=>server!.close(()=>resolve()));server=undefined;}setHouseholdConfigForTests(null,'demo');configureRuntimeData({serverMode:'development',appMode:'demo'});});
async function http(f:Awaited<ReturnType<typeof fixture>>, demo=false) {
  if(demo){setHouseholdConfigForTests(null,'demo');configureRuntimeData({serverMode:'development',appMode:'demo'});}
  server=createApp({mode:'development',appMode:demo?'demo':'household',accessBoundary:{mode:demo?'demo':'household',...(demo?{}:{context:f.context}),audit:()=>{}}}).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server!.once('listening',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');return `http://127.0.0.1:${address.port}/api/family-knowledge`;
}
const json=(value:unknown)=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
const rejected = async (f:Awaited<ReturnType<typeof fixture>>, operation:()=>unknown) => {
  const before=await f.bytes();const names=await readdir(join(f.root,'data'));
  await assert.rejects(async()=>f.run(operation));
  assert.equal(await f.bytes(),before);assert.deepEqual(await readdir(join(f.root,'data')),names);
};

describe('AI-1C canonical Profile and schema',()=>{
  it('reads legacy envelope without writing and creates one Household/Member Profile',async()=>{
    const f=await fixture();const before=await f.bytes();assert.deepEqual(await f.run(()=>store.profile()),{revision:0,profile:null});assert.equal(await f.bytes(),before);
    const household=await f.run(()=>store.createProfile({expectedRevision:0,subject:{kind:'HOUSEHOLD'}}));assert.equal(household.revision,1);
    await f.run(()=>store.createProfile({expectedRevision:1,subject:{kind:'MEMBER',memberId:'child-1'}}));
    assert.equal((await f.data()).schemaVersion,2);assert.equal((await f.data()).profiles.length,2);
    assert.equal(await readFile(`${f.path}.bak`,'utf8'),JSON.stringify(JSON.parse(await readFile(`${f.path}.bak`,'utf8')),null,2)+'\n');
    await rejected(f,()=>store.createProfile({expectedRevision:2,subject:{kind:'HOUSEHOLD'}}));
    await rejected(f,()=>store.createProfile({expectedRevision:2,subject:{kind:'MEMBER',memberId:'child-1'}}));
  });
  it('rejects unknown subjects, Family, names, aliases and identity attributes',async()=>{
    const f=await fixture();for(const subject of [{kind:'PERSON',memberId:'child-1'},{kind:'MEMBER',memberId:'family'},{kind:'MEMBER',memberId:'Child'},{kind:'MEMBER',memberId:'missing'},{kind:'HOUSEHOLD',displayName:'Other'}])await rejected(f,()=>store.createProfile({expectedRevision:0,subject}));
  });
  it('retains inactive member profiles through canonical rename/type changes without inferring relationships',async()=>{
    const f=await fixture(true);await f.run(()=>store.createProfile({expectedRevision:0,subject:{kind:'MEMBER',memberId:'child-1'}}));
    assert.ok((await f.run(()=>store.profile('child-1'))).profile);assert.deepEqual((await f.data()).relationships,[]);
    const config=updateMemberIdentityMetadata(f.config,'child-1',{displayName:'Renamed',aliases:['Nickname'],memberType:'adult'});
    await writeFile(join(f.root,'config','household.json'),JSON.stringify(config));setHouseholdConfigForTests(config);const context=await establishHouseholdAccess();
    assert.ok((await withHouseholdAccess(context,()=>store.profile('child-1'))).profile);assert.equal((await f.data()).profiles[0].subject.kind,'MEMBER');assert.deepEqual((await f.data()).relationships,[]);
    await assert.rejects(async()=>withHouseholdAccess(context,()=>store.profile('Nickname')));
  });
  for(const [kind,value] of Object.entries({LANGUAGE:{code:'ar-MA'},CITIZENSHIP:{countryCode:'GB'},BIRTH_CONTEXT:{date:null,place:'Explicit place'},RELIGIOUS_IDENTITY:{tradition:'Explicit tradition'},ACTIVITY_PARTICIPATION:{activity:'Swimming',organization:null},MEMBERSHIP:{organization:'Club',membershipType:null},CHILDCARE_ASSOCIATION:{organization:'Nursery'},CLOTHING_FIT:{garment:'Shirt',size:'M',system:null}}))it(`validates typed ${kind} facts`,async()=>{
    const f=await fixture();const created=await f.run(()=>store.createProfile({expectedRevision:0,subject:{kind:'HOUSEHOLD'}}));const profile=created.result as Profile;
    await f.run(()=>store.addFact(profile.id,{expectedRevision:1,fact:fact(kind,value)}));validateKnowledge(await f.data(),f.config);
    await rejected(f,()=>store.addFact(profile.id,{expectedRevision:2,fact:fact(kind,value)}));
  });
  it('rejects Memory/identity/schedule/permission fields and malformed typed/provenance/audience data',async()=>{
    const f=await fixture();const created=await f.run(()=>store.createProfile({expectedRevision:0,subject:{kind:'HOUSEHOLD'}}));const p=created.result as Profile;
    for(const change of [{kind:'PREFERENCE'},{kind:'FACT'},{kind:'NOTE'},{kind:'MEMBER_OF_HOUSEHOLD'},{value:{code:'en',permissions:['admin']}},{value:{code:'arbitrary language name'}},{audience:'PRIVATE'},{audience:'ADULTS'},{audience:'MEMBER'},{provenance:{...provenance,origin:'INFERRED'}},{provenance:{...provenance,suppliedByMemberId:'Dad'}},{provenance:{...provenance,recordedAt:'1900-01-01T00:00:00.000Z'}},{validFrom:'unknown'},{validFrom:'2026-02-01T00:00:00.000Z',validUntil:'2026-01-01T00:00:00.000Z'}])await rejected(f,()=>store.addFact(p.id,{expectedRevision:1,fact:{...fact(),...change}}));
  });
  it('supersedes semantic facts, preserves provenance/history, and retracts explicitly',async()=>{
    const f=await fixture();const p=(await f.run(()=>store.createProfile({expectedRevision:0,subject:{kind:'HOUSEHOLD'}}))).result as Profile;
    const first=(await f.run(()=>store.addFact(p.id,{expectedRevision:1,fact:fact()}))).result as Fact;
    const second=(await f.run(()=>store.addFact(p.id,{expectedRevision:2,fact:{...fact('LANGUAGE',{code:'fr'}),provenance:{...provenance,origin:'CONFIRMED'}}},first.id))).result as Fact;
    let data=await f.data();assert.equal(data.profiles[0].facts[0].lifecycle,'SUPERSEDED');assert.equal(data.profiles[0].facts[0].supersededBy,second.id);assert.equal(second.supersedes,first.id);assert.deepEqual(data.profiles[0].facts[0].provenance,first.provenance);
    await rejected(f,()=>store.addFact(p.id,{expectedRevision:3,fact:fact()},first.id));
    await f.run(()=>store.retractFact(p.id,second.id,{expectedRevision:3}));data=await f.data();assert.equal(data.profiles[0].facts[1].lifecycle,'RETRACTED');assert.equal(data.profiles[0].facts.length,2);assert.equal(data.profiles[0].facts[0].validFrom,null);
    await rejected(f,()=>store.retractFact(p.id,second.id,{expectedRevision:4}));
  });
});

describe('AI-1C explicit Family Graph',()=>{
  for(const type of ['PARENT_OF','GUARDIAN_OF','SPOUSE_OF'])it(`persists explicit ${type} with lifecycle and provenance`,async()=>{
    const f=await fixture(true);const edge=(await f.run(()=>store.createRelationship({expectedRevision:0,relationship:relationship(type)}))).result as Relationship;
    assert.equal(edge.validFrom,null);assert.equal(edge.provenance.origin,'EXPLICIT');assert.equal(edge.lifecycle,'ACTIVE');
    await f.run(()=>store.retractRelationship(edge.id,{expectedRevision:1}));assert.equal((await f.data()).relationships[0].lifecycle,'RETRACTED');
    await f.run(()=>store.createRelationship({expectedRevision:2,relationship:relationship(type)}));assert.equal((await f.data()).relationships.length,2);
  });
  it('rejects inferred/unknown/membership/self/alias/foreign endpoints and duplicate spouse reversal',async()=>{
    const f=await fixture();for(const value of [relationship('MEMBER_OF_HOUSEHOLD'),relationship('FRIEND_OF'),relationship('PARENT_OF','adult-1','adult-1'),relationship('PARENT_OF','Adult','child-1'),relationship('PARENT_OF','adult-1','unknown'),{...relationship(),provenance:{...provenance,origin:'SYSTEM'}}])await rejected(f,()=>store.createRelationship({expectedRevision:0,relationship:value}));
    await f.run(()=>store.createRelationship({expectedRevision:0,relationship:relationship('SPOUSE_OF')}));
    await rejected(f,()=>store.createRelationship({expectedRevision:1,relationship:relationship('SPOUSE_OF','child-1','adult-1')}));
  });
  it('rejects duplicate/cyclic parent edges without inferring guardianship/spousal permissions',async()=>{
    const f=await fixture();await f.run(()=>store.createRelationship({expectedRevision:0,relationship:relationship()}));
    await rejected(f,()=>store.createRelationship({expectedRevision:1,relationship:relationship()}));await rejected(f,()=>store.createRelationship({expectedRevision:1,relationship:relationship('PARENT_OF','child-1','adult-1')}));
    await f.run(()=>store.createRelationship({expectedRevision:1,relationship:relationship('GUARDIAN_OF')}));assert.equal((await f.data()).relationships.length,2);
  });
  it('bounds traversal, derives membership and filters explicit lifecycle',async()=>{
    const f=await fixture();const edge=(await f.run(()=>store.createRelationship({expectedRevision:0,relationship:relationship()}))).result as Relationship;
    const query={memberId:'adult-1',relationshipTypes:['PARENT_OF','GUARDIAN_OF'],direction:'BOTH',depth:1,limit:1,includeRetracted:false};
    await f.run(()=>store.createRelationship({expectedRevision:1,relationship:relationship('GUARDIAN_OF')}));
    const result=await f.run(()=>store.graph(query));assert.equal(result.relationships.length,1);assert.equal(result.truncated,true);assert.equal(result.derivedMembership.length,2);assert.ok((await f.data()).relationships.every(r=>r.type!=='MEMBER_OF_HOUSEHOLD' as any));
    for(const changes of [{depth:0},{depth:4},{limit:101},{limit:0},{memberId:'family'},{relationshipTypes:['MEMBER_OF_HOUSEHOLD']},{direction:'ALL'}])await assert.rejects(async()=>f.run(()=>store.graph({...query,...changes})));
    await f.run(()=>store.retractRelationship(edge.id,{expectedRevision:2}));assert.equal((await f.run(()=>store.graph({...query,relationshipTypes:['PARENT_OF']}))).relationships.length,0);assert.equal((await f.run(()=>store.graph({...query,relationshipTypes:['PARENT_OF'],includeRetracted:true}))).relationships.length,1);
  });
});

describe('AI-1C persistence, capability and runtime compatibility',()=>{
  it('rejects stale/concurrent revisions with no lost updates or rejected changes',async()=>{
    const f=await fixture();const result=await Promise.allSettled([f.run(()=>store.createProfile({expectedRevision:0,subject:{kind:'HOUSEHOLD'}})),f.run(()=>store.createProfile({expectedRevision:0,subject:{kind:'MEMBER',memberId:'child-1'}}))]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal((await f.data()).revision,1);
    const before=await f.bytes();await rejected(f,()=>store.createProfile({expectedRevision:0,subject:{kind:'MEMBER',memberId:'adult-1'}}));assert.equal(await f.bytes(),before);
    assert.equal(JSON.parse(await readFile(`${f.path}.bak`,'utf8')).schemaVersion,1);assert.ok(!(await readdir(join(f.root,'data'))).some(name=>name.endsWith('.tmp')));
  });
  it('fails before file access without capability and blocks Demo',async()=>{
    const f=await fixture();await unlink(f.path);assert.throws(()=>store.profile(),AccessError);assert.throws(()=>store.createProfile({expectedRevision:0,subject:{kind:'HOUSEHOLD'}}),AccessError);
    setHouseholdConfigForTests(null,'demo');configureRuntimeData({serverMode:'development',appMode:'demo'});assert.throws(()=>f.run(()=>store.profile()),AccessError);
  });
  it('fails closed for foreign/corrupt primary, canonical-reference mismatch and Memory without fallback',async()=>{
    const f=await fixture();await f.run(()=>store.createProfile({expectedRevision:0,subject:{kind:'MEMBER',memberId:'child-1'}}));const valid=await f.data();
    for(const bad of [{...valid,householdId:'hh_00000000-0000-4000-8000-000000000099'},{...valid,memories:[{}]},{...valid,profiles:[{...valid.profiles[0],subject:{kind:'MEMBER',memberId:'unknown'}}]}]){
      await writeFile(f.path,JSON.stringify(bad));await assert.rejects(async()=>f.run(()=>store.profile()),{code:'FAMILY_KNOWLEDGE_UNAVAILABLE'});await assert.rejects(()=>validateProductionRuntime(f.root));assert.equal(await f.bytes(),JSON.stringify(bad));
    }
  });
  it('rejects symlinked primary without following it for writes',async()=>{
    const f=await fixture();const target=join(f.root,'external.json');const original=await f.bytes();await writeFile(target,original);await unlink(f.path);await symlink(target,f.path);
    await assert.rejects(async()=>f.run(()=>store.createProfile({expectedRevision:0,subject:{kind:'HOUSEHOLD'}})));assert.equal(await readFile(target,'utf8'),original);
  });
  it('keeps the primary unchanged when backup publication fails and cleans staging files',async()=>{
    const f=await fixture();const before=await f.bytes();
    const {mkdir}=await import('node:fs/promises');await mkdir(`${f.path}.bak`);
    await assert.rejects(async()=>f.run(()=>store.createProfile({expectedRevision:0,subject:{kind:'HOUSEHOLD'}})));
    assert.equal(await f.bytes(),before);assert.ok(!(await readdir(join(f.root,'data'))).some(name=>name.endsWith('.tmp')||name.endsWith('backup-tmp')));
  });
  it('never trusts mutated returned data or accepts revision/metadata/schema injection',async()=>{
    const f=await fixture();const result=await f.run(()=>store.createProfile({expectedRevision:0,subject:{kind:'HOUSEHOLD'}}));
    const profile=result.result as Profile;profile.subject={kind:'MEMBER',memberId:'unknown'};
    assert.equal((await f.data()).profiles[0].subject.kind,'HOUSEHOLD');
    for(const change of [{expectedRevision:-1},{expectedRevision:0.5},{expectedRevision:'1'},{expectedRevision:1,revision:9},{expectedRevision:1,memories:[]}])await rejected(f,()=>store.createProfile({...change,subject:{kind:'MEMBER',memberId:'child-1'}}));
    const valid=await f.data();for(const patch of [{revision:-1},{schemaVersion:99},{revision:Number.MAX_SAFE_INTEGER},{revision:0},{memories:[{type:'PREFERENCE'}]}])assert.throws(()=>validateKnowledge({...valid,...patch},f.config));
  });
  it('applies the same physical size bound during live reads and offline runtime validation',async()=>{
    const f=await fixture();const oversized=(await f.bytes())+' '.repeat(2*1024*1024);await writeFile(f.path,oversized);
    await assert.rejects(async()=>f.run(()=>store.profile()),{code:'FAMILY_KNOWLEDGE_UNAVAILABLE'});
    await assert.rejects(()=>validateProductionRuntime(f.root));assert.equal(await f.bytes(),oversized);
  });
  it('round-trips populated Profile/Graph through native snapshot/restore; legacy snapshots remain verifiable',async()=>{
    const f=await fixture();const backup=await mkdtemp(join(tmpdir(),'eyos-knowledge-backup-'));
    try{
      const legacy=await createRuntimeSnapshot({runtimeRoot:f.root,backupRoot:backup});await verifyRuntimeSnapshot(legacy.snapshotPath);
      await f.run(()=>store.createProfile({expectedRevision:0,subject:{kind:'HOUSEHOLD'}}));await f.run(()=>store.createRelationship({expectedRevision:1,relationship:relationship()}));const populated=await f.bytes();
      await validateProductionRuntime(f.root);const snapshot=await createRuntimeSnapshot({runtimeRoot:f.root,backupRoot:backup});assert.equal((await verifyRuntimeSnapshot(snapshot.snapshotPath)).fileCount,10);
      const current=await f.data();await f.run(()=>store.retractRelationship(current.relationships[0].id,{expectedRevision:2}));
      await restoreRuntime({runtimeRoot:f.root,backupRoot:backup,snapshotId:snapshot.snapshotId,confirmRestore:snapshot.snapshotId});assert.equal(await f.bytes(),populated);await validateProductionRuntime(f.root);await verifyRuntimeSnapshot(legacy.snapshotPath);
    }finally{await rm(backup,{recursive:true,force:true});}
  });
  it('exposes only classified Household APIs with revision conflicts and generic errors',async()=>{
    const f=await fixture();const base=await http(f);assert.equal((await fetch(`${base}/profiles`)).status,200);
    assert.equal((await fetch(`${base}/profiles`,json({expectedRevision:0,subject:{kind:'HOUSEHOLD'}}))).status,201);
    assert.equal((await fetch(`${base}/profiles`,json({expectedRevision:0,subject:{kind:'MEMBER',memberId:'child-1'}}))).status,409);
    const bad=await fetch(`${base}/profiles`,json({expectedRevision:1,subject:{kind:'MEMBER',memberId:'Private unknown'}}));assert.equal(bad.status,400);assert.doesNotMatch(await bad.text(),/Private|hh_|adult-1|config\//);
  });
  it('rejects invalid member context before accessing even a missing knowledge primary',async()=>{
    const f=await fixture();const base=await http(f);await unlink(f.path);
    assert.equal((await fetch(`${base}/profiles`,json({expectedRevision:0,subject:{kind:'MEMBER',memberId:'unknown'}}))).status,400);
    assert.equal((await fetch(`${base}/profiles?memberId=unknown`)).status,400);
    assert.equal((await fetch(`${base}/graph/query`,json({memberId:'unknown',relationshipTypes:['PARENT_OF'],direction:'BOTH',depth:1,limit:5,includeRetracted:false}))).status,400);
  });
  it('rejects Demo HTTP reads/mutations without changing the real envelope',async()=>{
    const f=await fixture();const before=await f.bytes();const base=await http(f,true);assert.equal((await fetch(`${base}/profiles`)).status,403);assert.equal((await fetch(`${base}/profiles`,json({expectedRevision:0,subject:{kind:'HOUSEHOLD'}}))).status,403);assert.equal(await f.bytes(),before);
  });
});
