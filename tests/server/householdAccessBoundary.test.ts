import './helpers/providerEnvironment.js';
import { createApp } from '../../server/src/app.js';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import { testRuntime } from './helpers/householdAccess.js';
import { canonicalConfig, legacyConfig } from '../fixtures/canonicalIdentity.js';
import { getHouseholdConfig, setHouseholdConfigForTests, updateMemberIdentityMetadata } from '../../server/src/config/householdConfig.js';
import { configureRuntimeData, getRuntimeDataConfiguration as runtimeConfiguration } from '../../server/src/config/runtimeData.js';
import { AccessError, establishHouseholdAccess, withHouseholdAccess, assertHouseholdAccess, requireHouseholdAccess, guardedLiveService } from '../../server/src/access/householdAccess.js';
import { classifiedRouter, assertClassifiedRoutes, routeManifest, type AccessBoundary, type AuditRecord } from '../../server/src/access/classifiedRouter.js';
import { validateMemberContext } from '../../server/src/access/memberContext.js';
import { routineStore } from '../../server/src/services/routineStore.js';
import { reconcileRoutineRewards } from '../../server/src/services/routineRewardReconciler.js';
import { calendarReadCoordinator } from '../../server/src/services/calendarReadCoordinator.js';
const servers: Server[] = [];
const audit: AuditRecord[] = [];
async function start(boundary: AccessBoundary) {
  for (const key of ['NEST_CLIENT_ID','NEST_CLIENT_SECRET','NEST_REFRESH_TOKEN','NEST_PROJECT_ID','NEST_DEVICE_NAME','NOTION_TOKEN','NOTION_TASKS_DATA_SOURCE_ID']) process.env[key] ??= 'synthetic';
  const server = createApp({ mode: 'development', appMode: boundary.mode, accessBoundary: { ...boundary, audit: record => audit.push(record) } }).listen(0, '127.0.0.1');
  servers.push(server); await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}
const json = (body: unknown, method = 'POST') => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  audit.length = 0; setHouseholdConfigForTests(null, 'demo');
  configureRuntimeData({ serverMode: 'development', appMode: 'demo' });
});
describe('AI-1B trusted runtime and service boundary', () => {
  it('issues immutable context, denies missing/fabricated/foreign-runtime context', async () => {
    const { context } = await testRuntime(); assert.ok(Object.isFrozen(context)); assertHouseholdAccess(context);
    assert.throws(() => assertHouseholdAccess({ ...context }), { code: 'HOUSEHOLD_CONTEXT_INVALID' });
    assert.throws(() => assertHouseholdAccess(undefined), { code: 'HOUSEHOLD_CONTEXT_UNAVAILABLE' });
    await testRuntime(); assert.throws(() => withHouseholdAccess(context, () => {}), { code: 'HOUSEHOLD_CONTEXT_INVALID' });
  });
  it('never manufactures context for local initialize mode', async () => {
    setHouseholdConfigForTests(canonicalConfig(legacyConfig)); configureRuntimeData({ serverMode: 'development', appMode: 'household' });
    await assert.rejects(establishHouseholdAccess, { code: 'HOUSEHOLD_CONTEXT_UNAVAILABLE' });
  });
  for (const problem of ['foreign', 'missing', 'nonempty', 'invalid-config']) it(`fails closed for ${problem} identity/envelope`, async () => {
    const { root } = await testRuntime();
    if (problem === 'invalid-config') await writeFile(join(root,'config','household.json'), '{}');
    else await writeFile(join(root,'data','family-knowledge.local.json'), problem === 'missing' ? '' : JSON.stringify({ schemaVersion:1, householdId: problem === 'foreign' ? 'hh_00000000-0000-4000-8000-000000000099' : getHouseholdConfig().household.householdId, revision:0, profiles: problem === 'nonempty' ? [{}] : [], relationships:[], memories:[] }));
    await assert.rejects(establishHouseholdAccess, { code: 'HOUSEHOLD_CONTEXT_INVALID' });
  });
  it('guards live store/coordinator/startup jobs and propagates context without leaking', async () => {
    const {context}=await testRuntime(); assert.throws(()=>routineStore.read(),AccessError);
    await assert.rejects(reconcileRoutineRewards,AccessError); assert.throws(()=>calendarReadCoordinator.get({}),AccessError);
    await withHouseholdAccess(context,async()=>{await Promise.resolve();assert.equal(requireHouseholdAccess(),context);await routineStore.read();});
    assert.throws(requireHouseholdAccess,AccessError);
  });
  it('denies before a live facade even constructs its store/provider dependency', async () => {
    await testRuntime(); let calls = 0;
    const service = guardedLiveService(() => { calls++; return { read: () => calls++ }; });
    assert.throws(() => service.read(), AccessError); assert.equal(calls, 0);
  });
  it('invalidates context if its runtime binding is mutated', async () => {
    const { context } = await testRuntime();
    const configuration = runtimeConfiguration();
    configuration.dataPath += '-changed';
    assert.throws(() => assertHouseholdAccess(context), { code: 'HOUSEHOLD_CONTEXT_INVALID' });
  });
  it('allows explicit inactive history; Family/type/name/aliases grant no authority', async () => {
    let config=updateMemberIdentityMetadata(canonicalConfig(legacyConfig),'child-1',{lifecycle:'INACTIVE',aliases:['Alias']});
    const {context}=await testRuntime(config);
    withHouseholdAccess(context,()=>{
      assert.throws(()=>validateMemberContext('child-1'),AccessError);validateMemberContext('child-1',{historical:true});validateMemberContext('family',{family:true});
      for(const id of ['family','Alias','Child','missing'])assert.throws(()=>validateMemberContext(id),AccessError);
    });
    config=updateMemberIdentityMetadata(config,'adult-1',{memberType:'child'});
    const next=await testRuntime(config);withHouseholdAccess(next.context,()=>validateMemberContext('adult-1'));
  });
});
describe('AI-1B classified HTTP boundary',()=>{
  it('allows existing clients to read and mutate without new headers',async()=>{
    const {context}=await testRuntime();const base=await start({mode:'household',context});
    assert.equal((await fetch(`${base}/api/lists`)).status,200);
    assert.equal((await fetch(`${base}/api/lists`,json({id:'00000000-0000-4000-8000-000000000002',name:'Acceptance'}))).status,201);
    assert.match(await (await fetch(`${base}/api/lists`)).text(),/Acceptance/);
  });
  for(const fabricated of [false,true])it(`denies ${fabricated?'fabricated':'missing'} context before reads/mutations`,async()=>{
    const {context,root}=await testRuntime();const base=await start({mode:'household',...(fabricated?{context:{...context}}:{})});
    const before=await readFile(join(root,'data','lists.local.json'));
    for(const init of [{},json({name:'Denied'})]){const response=await fetch(`${base}/api/lists`,init);assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/hh_|config\/|Runtime/);}
    assert.deepEqual(await readFile(join(root,'data','lists.local.json')),before);
  });
  it('accepts matching assertion metadata; rejects conflicting/malformed/repeated assertions and mode crossover',async()=>{
    const {context}=await testRuntime();const base=await start({mode:'household',context});
    assert.equal((await fetch(`${base}/api/lists`,{headers:{'X-EYOS-Household-ID':context.householdId}})).status,200);
    assert.equal((await fetch(`${base}/api/lists?householdId=${context.householdId}`)).status,200);
    for(const suffix of ['?householdId=forged','?householdId=','?householdId=a&householdId=b',`?householdId=${context.householdId}`])assert.equal((await fetch(`${base}/api/lists${suffix}`,{headers:{'X-EYOS-Household-ID':context.householdId}})).status,403);
    assert.equal((await fetch(`${base}/api/lists`,{headers:{'X-EYOS-App-Mode':'demo'}})).status,403);
    assert.equal((await fetch(`${base}/api/lists`,json({id:'00000000-0000-4000-8000-000000000002',name:'Matching',householdId:context.householdId}))).status,201);
  });
  for(const id of ['missing','child-1'])it(`rejects ${id} current member before domain access`,async()=>{
    const config=updateMemberIdentityMetadata(canonicalConfig(legacyConfig),'child-1',{lifecycle:'INACTIVE'});const {context,root}=await testRuntime(config);const base=await start({mode:'household',context});
    const before=await readFile(join(root,'data','rewards.local.json'));assert.equal((await fetch(`${base}/api/rewards/awards`,json({profileId:id}))).status,400);assert.deepEqual(await readFile(join(root,'data','rewards.local.json')),before);
  });
  it('protects HEAD; OPTIONS, unknown paths/methods and health cause no domain access',async()=>{
    await testRuntime();const base=await start({mode:'household'});
    assert.equal((await fetch(`${base}/api/lists`,{method:'HEAD'})).status,503);
    assert.equal((await fetch(`${base}/api/lists`,{method:'OPTIONS',headers:{Origin:'http://localhost:5173'}})).status,204);
    assert.equal((await fetch(`${base}/api/lists`,{method:'PUT'})).status,404);assert.equal((await fetch(`${base}/api/unknown`)).status,404);assert.equal((await fetch(`${base}/health`)).status,200);
  });
  it('Demo blocks real providers/stores while serving synthetic Calendar',async()=>{
    configureRuntimeData({serverMode:'development',appMode:'demo'});setHouseholdConfigForTests(null,'demo');const base=await start({mode:'demo'});
    const original=globalThis.fetch;let calls=0;globalThis.fetch=((input:any,init:any)=>{if(!String(input).startsWith(base)){calls++;throw new Error('No provider');}return original(input,init);}) as typeof fetch;
    try{for(const path of ['/api/tasks','/api/nest/status','/api/petrol','/api/lists','/api/routines','/api/rewards','/api/calendar/events/fake/edit-context'])assert.equal((await fetch(base+path)).status,403);
      assert.equal((await fetch(`${base}/api/tasks`,json({task:'denied'}))).status,403);assert.equal((await fetch(`${base}/api/calendar`)).status,200);assert.equal((await fetch(`${base}/api/calendar`,{headers:{'X-EYOS-Household-ID':'forged'}})).status,403);assert.equal(calls,0);
    }finally{globalThis.fetch=original;}
  });
  it('denies every registered endpoint before provider access or missing-store initialization', async () => {
    const { root } = await testRuntime(); const base = await start({ mode: 'household' });
    await unlink(join(root, 'data', 'lists.local.json'));
    const original = globalThis.fetch; let calls = 0;
    globalThis.fetch = ((input: any, init: any) => {
      if (!String(input).startsWith(base)) { calls++; throw new Error('Provider must not run'); }
      return original(input, init);
    }) as typeof fetch;
    try {
      for (const route of routeManifest()) {
        const path = `/api/${({ clientConfig: 'config', prayerTimes: 'prayer-times' } as Record<string,string>)[route.domain] ?? route.domain}${route.path === '/' ? '' : route.path}`.replace(/:[A-Za-z]+/g, 'untrusted');
        const init = route.method === 'GET' ? {} : json({}, route.method);
        const response = await fetch(base + path, init);
        assert.equal(response.status, 503, `${route.method} ${path}`);
      }
      assert.equal(calls, 0);
      await assert.rejects(readFile(join(root, 'data', 'lists.local.json')), { code: 'ENOENT' });
    } finally { globalThis.fetch = original; }
  });
  it('rejects duplicate JSON/header assertions but leaves nested content and title text alone', async () => {
    const { context } = await testRuntime(); const base = await start({ mode: 'household', context });
    for (const body of [
      `{"householdId":"forged","householdId":"${context.householdId}"}`,
      `{"householdId":"forged","household\\u0049d":"${context.householdId}"}`,
      '{"appMode":"demo","appMode":"household"}',
    ]) assert.equal((await fetch(`${base}/api/lists`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
    const duplicateHeaders = new Headers(); duplicateHeaders.append('X-EYOS-Household-ID',context.householdId); duplicateHeaders.append('X-EYOS-Household-ID',context.householdId);
    assert.equal((await fetch(`${base}/api/lists`, { headers: duplicateHeaders })).status, 403);
    const response = await fetch(`${base}/api/lists`, json({ id:'00000000-0000-4000-8000-000000000002', name:'householdId: unrelated text' }));
    assert.equal(response.status,201);
  });
  it('classifies all 57 endpoints and refuses unclassified direct/nested routes',async()=>{
    await testRuntime();await start({mode:'household'});assert.equal(routeManifest().length,57);assert.equal(routeManifest().filter(item=>item.demo).length,3);
    assert.throws(()=>classifiedRouter('bad').get('/',undefined as never,()=>{}),/UNCLASSIFIED/);
    const app=express();app.get('/api/bypass',()=>{});assert.throws(()=>assertClassifiedRoutes(app),/UNCLASSIFIED/);
    const middleware=express();middleware.use('/api/bypass',(_req,res)=>{res.json({private:true});});assert.throws(()=>assertClassifiedRoutes(middleware),/UNCLASSIFIED/);
    const nested=express.Router();nested.get('/bypass',()=>{});const other=express();other.use('/api',nested);assert.throws(()=>assertClassifiedRoutes(other),/UNCLASSIFIED/);
  });
  it('logs only fixed audit metadata without supplied private values',async()=>{
    const {context}=await testRuntime();const base=await start({mode:'household',context});await fetch(`${base}/api/lists`,json({householdId:'private-forged',name:'private-content'}));
    assert.ok(audit.some(item=>item.decision==='DENY'));assert.doesNotMatch(JSON.stringify(audit),/private-|hh_|Synthetic|adult-1/);assert.deepEqual(Object.keys(audit[0]).sort(),['route','classification','decision','code','timestamp'].sort());
  });
});
