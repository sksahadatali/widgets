import './helpers/providerEnvironment.js';
import assert from 'node:assert/strict';
import { afterEach,describe,it } from 'node:test';
import { unlink,writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { contextFixture,request,memory,source } from './helpers/context.js';
import { createApp } from '../../server/src/app.js';
import { retrieveContext } from '../../server/src/context/contextService.js';
import { familyKnowledgeStore } from '../../server/src/knowledge/familyKnowledgeStore.js';
import { withHouseholdAccess } from '../../server/src/access/householdAccess.js';
import { routeManifest } from '../../server/src/access/classifiedRouter.js';
import { configureRuntimeData,getRuntimeDataConfiguration } from '../../server/src/config/runtimeData.js';
import { setHouseholdConfigForTests } from '../../server/src/config/householdConfig.js';
const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(s=>new Promise<void>(resolve=>s.close(()=>resolve()))));});
async function http(f:Awaited<ReturnType<typeof contextFixture>>, mode:'household'|'demo'='household',context:unknown=f.context) {
  if(mode==='demo'){setHouseholdConfigForTests(null,'demo');configureRuntimeData({serverMode:'development',appMode:'demo'});}
  const server=createApp({mode:'development',appMode:mode,accessBoundary:{mode,...(context?{context:context as any}:{}),audit:()=>{}}}).listen(0,'127.0.0.1');servers.push(server);
  await new Promise<void>(resolve=>server.once('listening',resolve));const a=server.address();assert.ok(a&&typeof a!=='string');return `http://127.0.0.1:${a.port}/api/context/retrieve`;
}
const json=(body:unknown)=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

describe('AI-1E canonical context and household capability',()=>{
  for(const memberId of ['unknown','family','Child','Nickname',' child-1'])it(`rejects noncanonical member context ${memberId} before a missing primary is accessed`,async()=>{
    const f=await contextFixture();await unlink(f.path);await assert.rejects(async()=>f.retrieve(request('MEAL_PREFERENCES',{subject:{kind:'MEMBER',memberId}})),{code:'INVALID_MEMBER_CONTEXT'});
  });
  it('permits inactive retained identity without historical reconstruction or inactive active-profile selection',async()=>{
    const f=await contextFixture({inactive:true});f.data.memories=[memory()];await f.write();
    await assert.rejects(async()=>f.retrieve(),{code:'INVALID_MEMBER_CONTEXT'});
    const r=await f.retrieve(request('MEAL_PREFERENCES',{subjectMode:'RETAINED_IDENTITY'}));assert.equal(r.subjectLifecycle,'INACTIVE');assert.equal(source(r,'FAMILY_MEMORY').items.length,1);assert.equal(r.asOf,'2026-11-03T12:00:00.000Z');
    await assert.rejects(async()=>f.retrieve(request('MEAL_PREFERENCES',{subjectMode:'RETAINED_IDENTITY',activeProfile:'child-1'})),{code:'INVALID_MEMBER_CONTEXT'});
    await assert.rejects(async()=>f.retrieve(request('MEAL_PREFERENCES',{subjectMode:'RETAINED_IDENTITY',asOf:'2010-01-01T00:00:00.000Z'})),{code:'CONTEXT_REQUEST_INVALID'});
  });
  it('selecting a member/Family changes personalisation only, not actor/roles/sources or authority',async()=>{
    const f=await contextFixture();f.data.memories=[memory()];await f.write();
    const a=await f.retrieve(request('MEAL_PREFERENCES',{activeProfile:'adult-1'})),b=await f.retrieve(request('MEAL_PREFERENCES',{activeProfile:'child-1'})),c=await f.retrieve();
    assert.deepEqual(a.actor,{verification:'UNVERIFIED',actorId:null,actorRole:null});assert.deepEqual(b.actor,a.actor);assert.deepEqual(c.actor,a.actor);assert.deepEqual(a.sources,b.sources);assert.deepEqual(b.sources,c.sources);
    await assert.rejects(async()=>retrieveContext(request('MEAL_PREFERENCES',{activeProfile:'adult-1'})),{code:'HOUSEHOLD_CONTEXT_UNAVAILABLE'});
  });
  it('rejects absent/fabricated direct capability before any store construction/read',async()=>{
    const f=await contextFixture();await unlink(f.path);
    await assert.rejects(async()=>retrieveContext(request()),{code:'HOUSEHOLD_CONTEXT_UNAVAILABLE'});
    assert.throws(()=>familyKnowledgeStore.contextProjection(request(),'2026-11-03T12:00:00.000Z'),{code:'HOUSEHOLD_CONTEXT_UNAVAILABLE'});
    assert.throws(()=>withHouseholdAccess({...f.context},()=>retrieveContext(request())),{code:'HOUSEHOLD_CONTEXT_INVALID'});
  });
  it('invalidates a bound capability when configuration/runtime is replaced',async()=>{
    const f=await contextFixture();setHouseholdConfigForTests(structuredClone(f.config));await assert.rejects(async()=>f.retrieve(),{code:'HOUSEHOLD_CONTEXT_INVALID'});
    setHouseholdConfigForTests(f.config);getRuntimeDataConfiguration().dataPath+='-changed';await assert.rejects(async()=>f.retrieve(),{code:'HOUSEHOLD_CONTEXT_INVALID'});
  });
  it('cannot reuse another runtime capability with an identical-shaped household identity',async()=>{
    const first=await contextFixture();await contextFixture();await assert.rejects(async()=>first.retrieve(),{code:'HOUSEHOLD_CONTEXT_INVALID'});
  });
});

describe('AI-1E classified HTTP read boundary',()=>{
  it('registers one HOUSEHOLD endpoint, without Demo fallback, and responds no-store',async()=>{
    const f=await contextFixture();await f.write();const url=await http(f);
    assert.equal(routeManifest().length,72);assert.deepEqual(routeManifest().filter(r=>r.domain==='context'),[{domain:'context',method:'POST',path:'/retrieve',classification:'HOUSEHOLD'}]);
    const response=await fetch(url,json(request()));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.json();assert.deepEqual(body.actor,{verification:'UNVERIFIED',actorId:null,actorRole:null});
    assert.equal((await fetch(url)).status,404);
  });
  for(const forged of [false,true])it(`rejects ${forged?'fabricated':'missing'} HTTP capability before a missing primary`,async()=>{
    const f=await contextFixture();await unlink(f.path);const url=await http(f,'household',forged?{...f.context}:null);const response=await fetch(url,json(request()));assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/family-knowledge|PRIVATE|child-1/);
  });
  it('rejects foreign/conflicting/duplicate household assertions and Demo mode assertions before domain access',async()=>{
    const f=await contextFixture();const url=await http(f);await unlink(f.path);
    for(const body of [{...request(),householdId:'hh_private_foreign'},{...request(),appMode:'demo'},{...request(),householdId:['bad']}])assert.equal((await fetch(url,json(body))).status,403);
    const repeated=JSON.stringify(request()).slice(0,-1)+',"householdId":"x","householdId":"x"}';assert.equal((await fetch(url,{...json({}),body:repeated})).status,403);
    assert.equal((await fetch(url,{...json(request()),headers:{'Content-Type':'application/json','X-EYOS-Household-ID':'foreign'}})).status,403);
  });
  it('accepts matching transport assertions without treating them as domain inputs',async()=>{
    const f=await contextFixture();await f.write();const url=await http(f);assert.equal((await fetch(url,json({...request(),householdId:f.config.household.householdId,appMode:'household'}))).status,200);
  });
  it('rejects invalid subject/profile/contract before a missing primary, with minimal errors',async()=>{
    const f=await contextFixture();const url=await http(f);await unlink(f.path);
    for(const body of [request('MEAL_PREFERENCES',{subject:{kind:'MEMBER',memberId:'private-unknown'}}),request('MEAL_PREFERENCES',{activeProfile:'private-unknown'}),request('MEAL_PREFERENCES',{actorId:'private-unknown'})]){
      const r=await fetch(url,json(body));assert.equal(r.status,400);assert.doesNotMatch(await r.text(),/private-|child-1|family-knowledge|\/tmp\//);
    }
  });
  it('returns CONFLICTED on revision precondition mismatch and never substitutes context',async()=>{
    const f=await contextFixture();f.data.memories=[memory()];await f.write();const url=await http(f);
    assert.equal((await fetch(url,json(request('MEAL_PREFERENCES',{requireKnowledgeRevision:17})))).status,200);
    const r=await fetch(url,json(request('MEAL_PREFERENCES',{requireKnowledgeRevision:16})));assert.equal(r.status,409);const body=await r.json();assert.equal(body.code,'CONTEXT_REVISION_CONFLICT');assert.deepEqual(body.sources,[{source:'FAMILY_MEMORY',states:['CONFLICTED']}]);assert.doesNotMatch(JSON.stringify(body),/PRIVATE|soup|topic-|knowledgeRevision|"items"/);
  });
  it('denies Demo HTTP/direct retrieval without real Knowledge access or fallback',async()=>{
    const f=await contextFixture();const bytes=await f.bytes();const url=await http(f,'demo',null);assert.equal((await fetch(url,json(request()))).status,403);assert.equal(await f.bytes(),bytes);await assert.rejects(async()=>f.retrieve(),{code:'DEMO_HOUSEHOLD_CROSSOVER'});
  });
});
