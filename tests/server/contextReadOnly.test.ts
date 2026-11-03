import './helpers/providerEnvironment.js';
import assert from 'node:assert/strict';
import { afterEach,describe,it,mock } from 'node:test';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { contextFixture,request,memory,fact,subject,uuid,CAPTURED,source,AS_OF } from './helpers/context.js';
import { retrieveContext } from '../../server/src/context/contextService.js';
import { familyKnowledgeStore } from '../../server/src/knowledge/familyKnowledgeStore.js';
import { setHouseholdConfigForTests } from '../../server/src/config/householdConfig.js';
import { createRuntimeSnapshot } from '../../server/src/runtime/runtimeSnapshot.js';
import { verifyRuntimeSnapshot } from '../../server/src/runtime/runtimeSnapshotValidation.js';
import { restoreRuntime } from '../../server/src/runtime/runtimeRestore.js';
import { validateProductionRuntime } from '../../server/src/runtime/runtimeRestoreValidation.js';
afterEach(()=>{mock.restoreAll();syncBuiltinESMExports();});
async function inventory(root:string):Promise<Record<string,string>> {
  const result:Record<string,string>={};
  async function visit(path:string,relative=''){for(const entry of (await fs.readdir(path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const name=`${relative}${entry.name}`;if(entry.isDirectory()){result[name+'/']='directory';await visit(join(path,entry.name),name+'/');}else result[name]=(await fs.readFile(join(path,entry.name))).toString('base64');}}
  await visit(root);return result;
}
async function unchanged(f:Awaited<ReturnType<typeof contextFixture>>,operation:()=>Promise<unknown>){const before=await inventory(f.root);await operation();assert.deepEqual(await inventory(f.root),before);}

describe('AI-1E authoritative read-only projection',()=>{
  it('preserves every runtime file, primary/backup/revision and directory on success/truncation/rejection without providers',async()=>{
    const f=await contextFixture();f.data.memories=Array.from({length:10},(_,n)=>memory(n+1));await f.write();await fs.writeFile(`${f.path}.bak`,'PRIVATE prior backup');
    const original=globalThis.fetch;let network=0;globalThis.fetch=(async()=>{network++;throw new Error('No provider allowed');}) as typeof fetch;
    try{await unchanged(f,async()=>{await f.retrieve();await f.retrieve(request('MEAL_PREFERENCES',{budget:{maxItems:1}}));await assert.rejects(()=>f.retrieve(request('MEAL_PREFERENCES',{requireKnowledgeRevision:16})),{code:'CONTEXT_REVISION_CONFLICT'});await assert.rejects(()=>f.retrieve({...request(),sources:['MEALS']}),{code:'CONTEXT_REQUEST_INVALID'});});assert.equal(network,0);assert.equal(JSON.parse(await f.bytes()).revision,17);}finally{globalThis.fetch=original;}
  });
  for(const problem of ['missing','corrupt','foreign','invalid-reference','invalid-memory','oversized'])it(`${problem} primary is UNAVAILABLE, never EMPTY or backup authority, with zero writes`,async()=>{
    const f=await contextFixture();f.data.memories=[memory()];await f.write();await fs.writeFile(`${f.path}.bak`,await f.bytes());
    if(problem==='missing')await fs.unlink(f.path);
    else if(problem==='corrupt')await fs.writeFile(f.path,'PRIVATE malformed json');
    else if(problem==='foreign')await fs.writeFile(f.path,JSON.stringify({...f.data,householdId:'hh_00000000-0000-4000-8000-000000000099'}));
    else if(problem==='invalid-reference')await fs.writeFile(f.path,JSON.stringify({...f.data,memories:[memory(1,{subject:{kind:'MEMBER',memberId:'unknown'}})]}));
    else if(problem==='invalid-memory')await fs.writeFile(f.path,JSON.stringify({...f.data,memories:[memory(1,{audience:'PRIVATE'})]}));
    else await fs.writeFile(f.path,(await f.bytes())+' '.repeat(2*1024*1024));
    await unchanged(f,async()=>{await assert.rejects(()=>f.retrieve(),(error:any)=>{assert.equal(error.status,503);assert.equal(error.code,'CONTEXT_UNAVAILABLE');assert.deepEqual(error.sources,[{source:'FAMILY_MEMORY',states:['UNAVAILABLE']}]);assert.doesNotMatch(error.message,/PRIVATE|unknown|family-knowledge|\/tmp\//);return true;});});
  });
  it('reads the authoritative primary physically once for combined Profile and Memory, with no independent API reads',async()=>{
    const f=await contextFixture();f.data.profiles=[{id:uuid(901),subject,createdAt:CAPTURED,updatedAt:CAPTURED,facts:[fact()]}];f.data.memories=[memory(1,{assertion:{vocabularyVersion:1,domain:'SHOPPING',predicate:'PREFERS',value:{topic:'shirt',choice:'cotton',stance:'PREFER'}}})];await f.write();
    const original=fs.readFile;let reads=0;mock.method(fs,'readFile',async(...args:any[])=>{if(args[0]===f.path)reads++;return (original as any)(...args);});syncBuiltinESMExports();
    const r=await f.retrieve(request('CLOTHING_SHOPPING'));assert.equal(reads,1);assert.equal(source(r,'PROFILE').revision,17);assert.equal(source(r,'FAMILY_MEMORY').revision,17);assert.equal(source(r,'PROFILE').items.length,1);assert.equal(source(r,'FAMILY_MEMORY').items.length,1);
  });
  it('cannot combine different revisions when a real Memory mutation publishes during a Context read',async()=>{
    const f=await contextFixture();f.data.memories=[memory()];await f.write();const original=fs.readFile;let first=true;
    mock.method(fs,'readFile',async(...args:any[])=>{const bytes=await (original as any)(...args);if(args[0]===f.path&&first){first=false;const m=memory(2);const {id,lifecycle,createdAt,updatedAt,endedAt,supersedes,supersededBy,provenance,...input}=m;
      await f.run(()=>familyKnowledgeStore.createMemory({expectedRevision:17,memory:{...input,provenance:{origin:provenance.origin,suppliedByMemberId:provenance.suppliedByMemberId,sourceStatement:provenance.sourceStatement}}}));}return bytes;});syncBuiltinESMExports();
    const r=await f.retrieve();assert.equal(r.knowledgeRevision,17);assert.equal(source(r,'FAMILY_MEMORY').revision,17);assert.equal(source(r,'FAMILY_MEMORY').items.length,1);assert.equal(JSON.parse(await f.bytes()).revision,18);
    assert.equal((await f.retrieve()).knowledgeRevision,18);await assert.rejects(()=>f.retrieve(request('MEAL_PREFERENCES',{requireKnowledgeRevision:17})),{code:'CONTEXT_REVISION_CONFLICT'});
  });
  it('rechecks capability after asynchronous source access and discloses no context when binding changes',async()=>{
    const f=await contextFixture();await f.write();const original=fs.readFile;mock.method(fs,'readFile',async(...args:any[])=>{const bytes=await (original as any)(...args);if(args[0]===f.path)setHouseholdConfigForTests(structuredClone(f.config));return bytes;});syncBuiltinESMExports();
    await assert.rejects(()=>f.retrieve(),{code:'HOUSEHOLD_CONTEXT_INVALID'});
  });
  it('owns the request plan so mutation during asynchronous reading cannot widen source/subject/budget',async()=>{
    const f=await contextFixture();f.data.memories=[memory()];await f.write();const original=fs.readFile,input=request();
    mock.method(fs,'readFile',async(...args:any[])=>{const bytes=await (original as any)(...args);if(args[0]===f.path){input.subject.memberId='adult-1';input.purpose='FAMILY_RELATIONSHIPS';input.options.includeHouseholdDefaults=true;input.actorRole='admin';}return bytes;});syncBuiltinESMExports();
    const r=await f.retrieve(input);assert.equal(r.purpose,'MEAL_PREFERENCES');assert.deepEqual(r.subject,subject);assert.equal(source(r,'FAMILY_MEMORY').items.length,1);assert.equal(r.actor.actorRole,null);
  });
  for(const schemaVersion of [1,2,3])it(`reads schema ${schemaVersion} without upgrade/repair or persistence`,async()=>{
    const f=await contextFixture();await f.write({...f.data,schemaVersion,revision:schemaVersion===1?0:17});await unchanged(f,async()=>{const r=await f.retrieve();assert.deepEqual(source(r,'FAMILY_MEMORY').states,['EMPTY']);assert.equal(r.knowledgeRevision,schemaVersion===1?0:17);});assert.equal(JSON.parse(await f.bytes()).schemaVersion,schemaVersion);
  });
  it('preserves populated schema-v3 snapshots and retrieves fresh authoritative state after offline restore, including restored revision',async()=>{
    const f=await contextFixture(),backup=await fs.mkdtemp(join(tmpdir(),'eyos-context-backup-'));
    try{f.data.memories=[memory()];await f.write();const before=await f.retrieve();const snap=await createRuntimeSnapshot({runtimeRoot:f.root,backupRoot:backup});assert.equal((await verifyRuntimeSnapshot(snap.snapshotPath)).fileCount,10);
      const m=memory(2);const {id,lifecycle,createdAt,updatedAt,endedAt,supersedes,supersededBy,provenance,...input}=m;
      await f.run(()=>familyKnowledgeStore.createMemory({expectedRevision:17,memory:{...input,provenance:{origin:provenance.origin,suppliedByMemberId:provenance.suppliedByMemberId,sourceStatement:provenance.sourceStatement}}}));assert.equal((await f.retrieve()).knowledgeRevision,18);
      await restoreRuntime({runtimeRoot:f.root,backupRoot:backup,snapshotId:snap.snapshotId,confirmRestore:snap.snapshotId});await validateProductionRuntime(f.root);
      await unchanged(f,async()=>assert.deepEqual(await f.retrieve(),before));
    }finally{await fs.rm(backup,{recursive:true,force:true});}
  });
  it('emits only fixed unavailable/conflict/invalid audit signals on failures',async()=>{
    const f=await contextFixture();await f.write();const audit:any[]=[];const call=(input:unknown)=>f.run(()=>retrieveContext(input,{now:()=>new Date(AS_OF),audit:r=>audit.push(r)}));
    await assert.rejects(()=>call({...request(),actorId:'PRIVATE person'}));await assert.rejects(()=>call(request('MEAL_PREFERENCES',{requireKnowledgeRevision:16})));await fs.unlink(f.path);await assert.rejects(()=>call(request()));
    assert.deepEqual(audit.map(r=>r.outcome),['INVALID','CONFLICTED','UNAVAILABLE']);assert.doesNotMatch(JSON.stringify(audit),/PRIVATE|hh_|child-1|adult-1|\/tmp\/|family-knowledge.local/);assert.deepEqual(audit[2].sources,[{source:'FAMILY_MEMORY',states:['UNAVAILABLE']}]);
  });
});
