import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishAtomicRename } from '../../server/src/runtime/runtimeAtomicPublication.js';
import { RuntimeRestoreJournalPublicationError, captureRuntimeRestoreJournal, cleanupOwnedRuntimeRestoreJournal, getRuntimeRestoreJournalPath, readRuntimeRestoreJournal, writeRuntimeRestoreJournal, type RuntimeRestoreJournal } from '../../server/src/runtime/runtimeRestoreJournal.js';

const delays = [25, 50, 100, 200, 400, 800, 1600];
const roots: string[] = [];
afterEach(async () => {
  mock.restoreAll(); syncBuiltinESMExports();
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

describe('stable journal identity and publication uncertainty', () => {
  it('accepts metadata-only changes through observations, replacement and receipt removal', async () => {
    const f = await fixture();
    const original = fs.lstat;
    let tick = 0n;
    mock.method(fs, 'lstat', async (path: any, options: any) => {
      const stat = await original(path, options);
      if (!options?.bigint) return stat;
      const offset = ++tick;
      return new Proxy(stat, { get: (value, key) => ['birthtimeNs','mtimeNs','ctimeNs'].includes(String(key)) ? (value[key as keyof typeof value] as bigint) + offset : Reflect.get(value, key) });
    });
    syncBuiltinESMExports();
    let owned = await writeRuntimeRestoreJournal(f.root, initial());
    owned = await writeRuntimeRestoreJournal(f.root, next(), undefined, { expected: owned, platform: 'win32' });
    await owned.assertCurrent();
    await owned.remove();
    await assert.rejects(() => fs.lstat(f.path), { code: 'ENOENT' });
  });

  it('pins a prior receipt and rejects valid changed bytes even with the same operation ID', async () => {
    const f = await fixture();
    const owned = await writeRuntimeRestoreJournal(f.root, initial());
    const changed = JSON.stringify({ ...initial(), transitionState: 'complete' });
    await fs.writeFile(f.path, changed);
    await assert.rejects(() => writeRuntimeRestoreJournal(f.root, next(), undefined, { expected: owned }), /RESTORE_JOURNAL_CHANGED/);
    assert.equal(await f.bytes(), changed);
  });

  it('rejects content changes across an anchored observation without relying on timestamps', async () => {
    const f = await fixture(true);
    const original = fs.readFile;
    mock.method(fs, 'readFile', async (path: any, ...args: any[]) => {
      if (path === f.path) await fs.writeFile(f.path, JSON.stringify({ ...initial(), transitionState: 'complete' }));
      return (original as any)(path, ...args);
    });
    syncBuiltinESMExports();
    await assert.rejects(() => captureRuntimeRestoreJournal(f.root), /RESTORE_JOURNAL_CHANGED/);
  });

  for (const kind of ['flush', 'observation', 'foreign-replacement']) it(`marks rename success followed by ${kind} failure uncertain and never hands off the prior receipt`, async () => {
    const f = await fixture();
    const previous = await writeRuntimeRestoreJournal(f.root, initial());
    const error = failure('EIO');
    const original = fs.lstat;
    let rejectObservation = false;
    if (kind === 'observation') {
      mock.method(fs, 'lstat', async (path: any, ...args: any[]) => {
        if (path === f.path && rejectObservation) { rejectObservation = false; throw error; }
        return (original as any)(path, ...args);
      });
      syncBuiltinESMExports();
    }
    await assert.rejects(() => writeRuntimeRestoreJournal(f.root, next(), async () => {
      if (kind === 'flush') throw error;
      if (kind === 'observation') rejectObservation = true;
      if (kind === 'foreign-replacement') {
        await fs.rename(f.path, f.path + '.published-evidence');
        await fs.writeFile(f.path, JSON.stringify({ ...next(), operationId: '00000000-0000-4000-8000-000000000099' }));
      }
    }, { expected: previous }), candidate => candidate instanceof RuntimeRestoreJournalPublicationError &&
      (kind === 'foreign-replacement' ? String(candidate.operationError).includes('RESTORE_JOURNAL_CHANGED') : candidate.operationError === error));
    await assert.rejects(() => previous.remove(), /RESTORE_JOURNAL_CHANGED/);
    assert.ok(await fs.lstat(f.path));
    assert.equal((await readRuntimeRestoreJournal(f.root))?.transition, 'stage');
  });

  for (const patch of [{ operationId: '../foreign' }, { selectedSnapshotId: '../foreign' }, { source: { state: 'valid', protection: { kind: 'snapshot', snapshotId: '../foreign' } } }]) {
    it(`rejects unsafe journal-owned path identifiers ${Object.keys(patch)[0]}`, async () => {
      const f = await fixture();
      await assert.rejects(() => writeRuntimeRestoreJournal(f.root, { ...initial(), ...patch } as any), /RESTORE_JOURNAL_INVALID/);
      await assert.rejects(() => fs.lstat(f.path), { code: 'ENOENT' });
    });
  }
});
const failure = (code: string) => Object.assign(new Error(`synthetic ${code}`), { code });
const base: RuntimeRestoreJournal = {
  schemaVersion: 2, operationId: '00000000-0000-4000-8000-000000000001',
  selectedSnapshotId: '20260904T000000.000Z-aaaaaaaa', startedAt: '2026-09-04T00:00:00.000Z',
  source: { state: 'valid', protection: { kind: 'snapshot', snapshotId: 'pending' } },
  decision: 'undecided', transition: 'prepare', transitionState: 'intent',
};
const initial = () => structuredClone(base);
const next = (): RuntimeRestoreJournal => ({ ...initial(), transition: 'stage', transitionState: 'intent' });
async function fixture(existing = false) {
  const parent = await fs.mkdtemp(join(tmpdir(), 'eyos-journal-publication-')); roots.push(parent);
  const root = join(parent, 'runtime'); await fs.mkdir(root);
  const path = getRuntimeRestoreJournalPath(root);
  if (existing) await writeRuntimeRestoreJournal(root, initial());
  return { parent, root, path, bytes: () => fs.readFile(path, 'utf8') };
}

describe('shared Windows atomic-rename retry policy', () => {
  for (const code of ['EPERM', 'EACCES', 'EBUSY']) it(`retries only the transient Windows ${code} rename`, async () => {
    const events: string[] = []; let attempts = 0;
    await publishAtomicRename({ source: 'source', target: 'target', platform: 'win32',
      beforeAttempt: async () => { events.push('guard'); },
      renamer: async (source, target) => { assert.equal(source, 'source'); assert.equal(target, 'target'); events.push('rename'); if (++attempts < 3) throw failure(code); },
      sleeper: async delay => { events.push(`sleep:${delay}`); },
    });
    assert.deepEqual(events, ['guard','rename','sleep:25','guard','rename','sleep:50','guard','rename']);
  });
  it('exhausts after eight attempts and seven established delays, preserving the final error', async () => {
    const error = failure('EPERM'); let attempts = 0, guards = 0; const waits: number[] = [];
    await assert.rejects(() => publishAtomicRename({ source: 's', target: 't', platform: 'win32', beforeAttempt: async () => { guards++; },
      renamer: async () => { attempts++; throw error; }, sleeper: async ms => { waits.push(ms); },
    }), candidate => candidate === error);
    assert.equal(attempts, 8); assert.equal(guards, 8); assert.deepEqual(waits, delays);
  });
  for (const code of ['EIO','ENOSPC','EXDEV','ENOENT','EACCES','EPERM','EBUSY']) {
    for (const platform of (['EPERM','EACCES','EBUSY'].includes(code) ? ['linux','darwin'] : ['win32']) as NodeJS.Platform[]) it(`does not retry ${platform} ${code}`, async () => {
      let attempts = 0; const error = failure(code);
      await assert.rejects(() => publishAtomicRename({ source: 's', target: 't', platform, beforeAttempt: async () => {},
        renamer: async () => { attempts++; throw error; }, sleeper: async () => assert.fail('unexpected retry'),
      }), candidate => candidate === error); assert.equal(attempts, 1);
    });
  }
  it('never retries guard failures, even if their code is EPERM', async () => {
    const error = failure('EPERM'); let attempts = 0;
    await assert.rejects(() => publishAtomicRename({ source:'s',target:'t',platform:'win32',beforeAttempt:async()=>{throw error;},
      renamer:async()=>{attempts++;},sleeper:async()=>assert.fail('guard was retried'),
    }), candidate => candidate === error); assert.equal(attempts,0);
  });
  it('rechecks guards after delay and propagates their failure without another rename', async () => {
    let guards=0,attempts=0,waits=0;const error=failure('EBUSY');
    await assert.rejects(()=>publishAtomicRename({source:'s',target:'t',platform:'win32',beforeAttempt:async()=>{if(++guards===2)throw error;},
      renamer:async()=>{attempts++;throw failure('EPERM');},sleeper:async()=>{waits++;},
    }),candidate=>candidate===error);assert.equal(attempts,1);assert.equal(waits,1);
  });
});

describe('restore-journal atomic file publication', () => {
  it('creates once, replaces an owned existing journal, and keeps schema v2', async () => {
    const f=await fixture();await writeRuntimeRestoreJournal(f.root,initial());assert.deepEqual(await readRuntimeRestoreJournal(f.root),initial());
    await writeRuntimeRestoreJournal(f.root,next());assert.deepEqual(await readRuntimeRestoreJournal(f.root),next());
    assert.deepEqual((await fs.readdir(f.parent)).sort(),['.runtime.restore-state.json','runtime']);
    const before=await f.bytes();await assert.rejects(()=>writeRuntimeRestoreJournal(f.root,initial()),/RESTORE_JOURNAL_EXISTS/);assert.equal(await f.bytes(),before);
  });
  it('does not recreate a missing established journal for a transition update',async()=>{
    const f=await fixture();await assert.rejects(()=>writeRuntimeRestoreJournal(f.root,next()),/RESTORE_JOURNAL_MISSING/);assert.deepEqual(await fs.readdir(f.parent),['runtime']);
  });
  for(const code of ['EPERM','EACCES','EBUSY'])it(`reuses identical synced temporary bytes/path across ${code} retries`,async()=>{
    const f=await fixture(true),before=await f.bytes(),journal=next();const paths:string[]=[],payloads:string[]=[],events:string[]=[];let opens=0;
    await writeRuntimeRestoreJournal(f.root,journal,async()=>{events.push('parent-sync');assert.deepEqual(JSON.parse(await f.bytes()),next());},{platform:'win32',
      opener:async(path,flags,mode)=>{opens++;assert.equal(flags,'wx');assert.equal(mode,0o600);const h=await fs.open(path,flags,mode);events.push('open');return {
        stat:h.stat.bind(h),writeFile:async(...args:any[])=>{events.push('write');await (h.writeFile as any)(...args);},
        sync:async()=>{events.push('file-sync');await h.sync();},close:async()=>{await h.close();events.push('close');},
      };},
      renamer:async(source,target)=>{events.push('rename');paths.push(source);payloads.push(await fs.readFile(source,'utf8'));assert.equal(await f.bytes(),before);assert.equal(target,f.path);if(paths.length<3)throw failure(code);await fs.rename(source,target);},
      sleeper:async()=>{journal.transition='verify';journal.decision='forward';},
    });
    assert.equal(opens,1);assert.equal(new Set(paths).size,1);assert.equal(new Set(payloads).size,1);assert.deepEqual(JSON.parse(payloads[0]),next());
    assert.deepEqual(events,['open','write','file-sync','close','rename','rename','rename','parent-sync']);assert.equal((await fs.readdir(f.parent)).filter(n=>n.includes('.tmp-')).length,0);
  });
  it('retains previous authoritative bytes and original error after bounded exhaustion',async()=>{
    const f=await fixture(true),before=await f.bytes();let attempts=0;const waits:number[]=[],error=failure('EPERM');
    await assert.rejects(()=>writeRuntimeRestoreJournal(f.root,next(),async()=>assert.fail('flush after failed rename'),{platform:'win32',renamer:async()=>{attempts++;throw error;},sleeper:async ms=>{waits.push(ms);}}),candidate=>candidate===error);
    assert.equal(await f.bytes(),before);assert.equal(attempts,8);assert.deepEqual(waits,delays);assert.equal((await fs.readdir(f.parent)).filter(n=>n.includes('.tmp-')).length,0);
  });
  it('refuses an unexpectedly appearing destination without overwrite',async()=>{
    const f=await fixture();const foreign=JSON.stringify({...initial(),operationId:'foreign'});let attempts=0;
    await assert.rejects(()=>writeRuntimeRestoreJournal(f.root,initial(),undefined,{platform:'win32',renamer:async()=>{attempts++;throw failure('EPERM');},sleeper:async()=>{await fs.writeFile(f.path,foreign);}}),/RESTORE_JOURNAL_CHANGED/);
    assert.equal(attempts,1);assert.equal(await f.bytes(),foreign);
  });
  it('guards the destination before the first rename, not only between retries',async()=>{
    const f=await fixture(true),foreign=JSON.stringify({...initial(),operationId:'appeared-before-first-attempt'});
    await assert.rejects(()=>writeRuntimeRestoreJournal(f.root,next(),undefined,{opener:async(path,flags,mode)=>{const handle=await fs.open(path,flags,mode);await fs.writeFile(f.path,foreign);return handle;},renamer:async()=>assert.fail('unchecked first rename')}),/RESTORE_JOURNAL_CHANGED/);
    assert.equal(await f.bytes(),foreign);
  });
  for(const change of ['disappear','content','same-bytes-replacement'])it(`refuses established destination ${change} between attempts`,async()=>{
    const f=await fixture(true),before=await f.bytes();let attempts=0;
    await assert.rejects(()=>writeRuntimeRestoreJournal(f.root,next(),undefined,{platform:'win32',renamer:async()=>{attempts++;throw failure('EPERM');},sleeper:async()=>{
      if(change==='disappear')await fs.unlink(f.path);
      else if(change==='content')await fs.writeFile(f.path,JSON.stringify({...initial(),decision:'rollback'}));
      else{await fs.rename(f.path,f.path+'.old');await fs.writeFile(f.path,before);}
    }}),/RESTORE_JOURNAL_CHANGED/);assert.equal(attempts,1);
    if(change==='disappear')await assert.rejects(()=>f.bytes(),{code:'ENOENT'});else assert.equal(await f.bytes(),change==='content'?JSON.stringify({...initial(),decision:'rollback'}):before);
  });
  for(const kind of ['foreign-operation','foreign-snapshot','foreign-time','foreign-source','malformed','directory','decision'])it(`rejects ${kind} destination before publication`,async()=>{
    const f=await fixture();let contents:string|null=null;
    if(kind==='directory')await fs.mkdir(f.path);
    else{const foreign={...initial(),...(kind==='foreign-operation'?{operationId:'different'}:kind==='foreign-snapshot'?{selectedSnapshotId:'different'}:kind==='foreign-time'?{startedAt:'2026-09-05T00:00:00.000Z'}:kind==='foreign-source'?{source:{state:'invalid',protection:{kind:'evidence-only'}}}:kind==='decision'?{decision:'rollback'}:{})};contents=kind==='malformed'?'not JSON':JSON.stringify(foreign);await fs.writeFile(f.path,contents);}
    await assert.rejects(()=>writeRuntimeRestoreJournal(f.root,next(),undefined,{platform:'win32',renamer:async()=>assert.fail('unsafe publication'),sleeper:async()=>assert.fail('guard retried')}));
    if(contents!==null)assert.equal(await f.bytes(),contents);else assert.equal((await fs.lstat(f.path)).isDirectory(),true);
  });
  for(const change of ['missing','content','replacement','directory'])it(`refuses ${change} temporary source and preserves unexpected replacements`,async()=>{
    const f=await fixture(true),before=await f.bytes();let temporary='',attempts=0;
    await assert.rejects(()=>writeRuntimeRestoreJournal(f.root,next(),undefined,{platform:'win32',renamer:async(source)=>{temporary=source;attempts++;throw failure('EPERM');},sleeper:async()=>{
      if(change==='missing')await fs.unlink(temporary);
      else if(change==='content')await fs.writeFile(temporary,'unexpected changed source');
      else if(change==='replacement'){const payload=await fs.readFile(temporary);await fs.rename(temporary,temporary+'.old');await fs.writeFile(temporary,payload);}
      else{await fs.unlink(temporary);await fs.mkdir(temporary);}
    }}),/RESTORE_JOURNAL_(TEMPORARY_CHANGED|UNSAFE)/);assert.equal(attempts,1);assert.equal(await f.bytes(),before);
    if(change==='content')assert.equal(await fs.readFile(temporary,'utf8'),'unexpected changed source');
    if(change==='replacement')assert.deepEqual(JSON.parse(await fs.readFile(temporary,'utf8')),next());
    if(change==='directory')assert.equal((await fs.lstat(temporary)).isDirectory(),true);
  });
  for(const target of ['source','destination'])it(`refuses a link-like ${target} without requiring symlink privileges in the test`,async()=>{
    const f=await fixture(true),before=await f.bytes();const original=fs.lstat;let temporary='',unsafe=false,attempts=0;
    mock.method(fs,'lstat',async(path:any,...args:any[])=>{const stats=await (original as any)(path,...args);if(unsafe&&path===(target==='source'?temporary:f.path))return new Proxy(stats,{get:(object,key)=>key==='isSymbolicLink'?()=>true:Reflect.get(object,key)});return stats;});syncBuiltinESMExports();
    await assert.rejects(()=>writeRuntimeRestoreJournal(f.root,next(),undefined,{platform:'win32',renamer:async(source)=>{temporary=source;attempts++;throw failure('EPERM');},sleeper:async()=>{unsafe=true;}}),/RESTORE_JOURNAL_UNSAFE/);assert.equal(attempts,1);assert.equal(await f.bytes(),before);
  });
  it('checks the owned temporary identity after close, before the first attempt',async()=>{
    const f=await fixture(true),before=await f.bytes();let temporary='';
    await assert.rejects(()=>writeRuntimeRestoreJournal(f.root,next(),undefined,{opener:async(path,flags,mode)=>{
      temporary=path;const h=await fs.open(path,flags,mode);return {stat:h.stat.bind(h),writeFile:h.writeFile.bind(h),sync:h.sync.bind(h),close:async()=>{await h.close();const data=await fs.readFile(path);await fs.rename(path,path+'.old');await fs.writeFile(path,data);}};
    },renamer:async()=>assert.fail('replacement published')}),/RESTORE_JOURNAL_TEMPORARY_CHANGED/);
    assert.equal(await f.bytes(),before);assert.deepEqual(JSON.parse(await fs.readFile(temporary,'utf8')),next());
  });
  it('fails when parent is replaced while waiting, without touching replacement files',async()=>{
    const f=await fixture(true),before=await f.bytes(),displaced=f.parent+'-displaced';roots.push(displaced);let attempts=0;
    await assert.rejects(()=>writeRuntimeRestoreJournal(f.root,next(),undefined,{platform:'win32',renamer:async()=>{attempts++;throw failure('EPERM');},sleeper:async()=>{
      await fs.rename(f.parent,displaced);await fs.mkdir(f.parent);await fs.writeFile(f.path,'unrelated replacement');
    }}),/RESTORE_JOURNAL_LOCATION_CHANGED/);assert.equal(attempts,1);assert.equal(await f.bytes(),'unrelated replacement');assert.equal(await fs.readFile(join(displaced,'.runtime.restore-state.json'),'utf8'),before);
  });
  it('only writes an exclusive temporary and never deletes/copies/truncates the authoritative destination',async()=>{
    const f=await fixture(true),before=await f.bytes();const originalRm=fs.rm;
    mock.method(fs,'rm',async(path:any,...args:any[])=>{assert.notEqual(path,f.path);return (originalRm as any)(path,...args);});mock.method(fs,'copyFile',async()=>assert.fail('copy fallback'));syncBuiltinESMExports();
    await writeRuntimeRestoreJournal(f.root,next(),undefined,{opener:async(path,flags,mode)=>{assert.notEqual(path,f.path);assert.equal(flags,'wx');return fs.open(path,flags,mode);},renamer:async(source,target)=>{assert.equal(await f.bytes(),before);await fs.rename(source,target);}});
    assert.deepEqual(await readRuntimeRestoreJournal(f.root),next());
  });
  for(const code of ['EPERM','EIO'])it(`keeps file sync ${code} fatal with no rename/retry`,async()=>{
    const f=await fixture(true),before=await f.bytes(),error=failure(code);let closed=false;
    await assert.rejects(()=>writeRuntimeRestoreJournal(f.root,next(),undefined,{platform:'win32',opener:async(path,flags,mode)=>{const h=await fs.open(path,flags,mode);return {stat:h.stat.bind(h),writeFile:h.writeFile.bind(h),sync:async()=>{throw error;},close:async()=>{closed=true;await h.close();}};},renamer:async()=>assert.fail('rename after failed sync'),sleeper:async()=>assert.fail('sync retried')}),candidate=>candidate===error);
    assert.equal(closed,true);assert.equal(await f.bytes(),before);
  });
  for(const code of ['EIO','EPERM'])it(`does not retry parent sync ${code} after a successful atomic publication`,async()=>{
    const f=await fixture(true);let attempts=0;const error=failure(code);
    await assert.rejects(()=>writeRuntimeRestoreJournal(f.root,next(),async()=>{throw error;},{platform:'win32',renamer:async(source,target)=>{attempts++;await fs.rename(source,target);},sleeper:async()=>assert.fail('flush retried')}),candidate=>candidate instanceof RuntimeRestoreJournalPublicationError && candidate.operationError===error);
    assert.equal(attempts,1);assert.deepEqual(await readRuntimeRestoreJournal(f.root),next());
  });
});


describe('ownership-safe pre-destructive journal cleanup', () => {
  it('removes only the unchanged file described by a successful publication receipt', async () => {
    const f = await fixture();
    const ownership = await writeRuntimeRestoreJournal(f.root, initial());
    await cleanupOwnedRuntimeRestoreJournal(f.root, ownership);
    await assert.rejects(() => fs.lstat(f.path), { code: 'ENOENT' });
  });

  it('accepts absent initial publication without calling a remover', async () => {
    const f = await fixture();
    await cleanupOwnedRuntimeRestoreJournal(f.root, undefined, async () => assert.fail('no owned journal'));
  });

  for (const replacement of ['foreign', 'changed', 'malformed', 'directory', 'missing', 'same-bytes-new-file']) {
    it(`retains ${replacement} instead of claiming ownership by pathname`, async () => {
      const f = await fixture();
      const ownership = await writeRuntimeRestoreJournal(f.root, initial());
      const original = await f.bytes();
      await fs.rename(f.path, `${f.path}.owned-evidence`);
      if (replacement === 'directory') await fs.mkdir(f.path);
      else if (replacement !== 'missing') await fs.writeFile(f.path,
        replacement === 'malformed' ? '{broken' : replacement === 'same-bytes-new-file' ? original :
        JSON.stringify({ ...initial(), ...(replacement === 'foreign' ? { operationId: 'other' } : { transitionState: 'complete' }) }));
      let removed = false;
      await assert.rejects(() => cleanupOwnedRuntimeRestoreJournal(f.root, ownership, async () => { removed = true; }));
      assert.equal(removed, false);
      assert.equal(await fs.readFile(`${f.path}.owned-evidence`, 'utf8'), original);
      if (replacement !== 'missing') assert.ok(await fs.lstat(f.path));
    });
  }

  it('rechecks identity at the last pathname check before removal', async () => {
    const f = await fixture();
    const ownership = await writeRuntimeRestoreJournal(f.root, initial());
    const originalLstat = fs.lstat;
    let observations = 0;
    mock.method(fs, 'lstat', async (path: Parameters<typeof fs.lstat>[0], options: unknown) => {
      if (path === f.path && ++observations === 3) {
        await fs.rename(f.path, `${f.path}.owned-evidence`);
        await fs.writeFile(f.path, 'foreign');
      }
      return originalLstat(path, options as { bigint: true });
    });
    syncBuiltinESMExports();
    await assert.rejects(() => cleanupOwnedRuntimeRestoreJournal(f.root, ownership), /RESTORE_JOURNAL_CHANGED/);
    assert.equal(await f.bytes(), 'foreign');
  });
});
