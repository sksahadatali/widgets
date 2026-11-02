import { validateMemories, validateMemoryQuery, memoryApplicability, sameMemoryFamily, canonicalMemoryValue, type FamilyMemory } from './familyMemorySchema.js';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getHouseholdConfig } from '../config/householdConfig.js';
import { getRuntimeStoreOptions, getRuntimeDataConfiguration, isPathWithin } from '../config/runtimeData.js';
import { requireHouseholdAccess, guardedLiveService } from '../access/householdAccess.js';
import { validateMemberContext } from '../access/memberContext.js';
import { flushDirectory } from '../runtime/runtimeDurability.js';
import { flushCopiedFile } from '../runtime/runtimeSnapshot.js';
import { MAX_KNOWLEDGE_BYTES, KnowledgeError, record, validateKnowledge, validateSubject, subjectKey, type KnowledgeV2, type KnowledgeV3, type Profile, type Fact, type Relationship, type Provenance } from './familyKnowledgeSchema.js';

const queues = new Map<string, Promise<unknown>>();
function captureProvenance(input: unknown, now: string): Provenance {
  const value = record(input, ['origin','suppliedByMemberId','sourceStatement']);
  if (value.suppliedByMemberId !== null) validateMemberContext(value.suppliedByMemberId);
  return { ...value, recordedAt: now } as Provenance;
}
function captureFact(input: unknown, now: string): Fact {
  const value = record(input, ['kind','value','audience','sensitivity','validFrom','validUntil','reviewAfter','provenance']);
  return { ...value, provenance: captureProvenance(value.provenance, now), id: randomUUID(), lifecycle: 'ACTIVE', createdAt: now, updatedAt: now, endedAt: null, supersedes: null, supersededBy: null } as Fact;
}
/** The only live access path. No implicit initialization, fallback or repair. */
class FamilyKnowledgeStore {
  private readonly file = getRuntimeStoreOptions('family-knowledge.local.json').filePath;
  private async load(): Promise<KnowledgeV2 | KnowledgeV3> {
    const context = requireHouseholdAccess();
    const config = getHouseholdConfig();
    try {
      const info = await lstat(this.file);
      const directory = await lstat(dirname(this.file));
      const root = getRuntimeDataConfiguration().rootPath;
      if (!root || !directory.isDirectory() || directory.isSymbolicLink() || !isPathWithin(await realpath(root), await realpath(this.file))) throw new Error('Unsafe runtime path');
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_KNOWLEDGE_BYTES || !isPathWithin(await realpath(dirname(this.file)), await realpath(this.file))) throw new Error('Unsafe file');
      const value = validateKnowledge(JSON.parse(await readFile(this.file, 'utf8')), config);
      if (value.householdId !== context.householdId) throw new Error('Wrong scope');
      // Pure in-memory normalization. Reading legacy snapshots/runtime never rewrites them.
      return structuredClone(value.schemaVersion === 1 ? { ...value, schemaVersion: 2 } : value) as KnowledgeV2 | KnowledgeV3;
    } catch { throw new KnowledgeError('FAMILY_KNOWLEDGE_UNAVAILABLE', 503); }
  }
  async profile(memberId?: unknown): Promise<{ revision: number; profile: Profile | null }> {
    requireHouseholdAccess();
    const subject = memberId === undefined ? { kind: 'HOUSEHOLD' as const } : validateSubject({ kind: 'MEMBER', memberId }, getHouseholdConfig());
    const store = await this.load();
    return { revision: store.revision, profile: store.profiles.find(p => subjectKey(p.subject) === subjectKey(subject)) ?? null };
  }
  private async mutate(input: unknown, change: (store: KnowledgeV3, body: Record<string, unknown>, now: string) => unknown, memoryMutation = false): Promise<{ revision: number; result: unknown }> {
    requireHouseholdAccess();
    const body = input as Record<string, unknown>;
    if (!body || typeof body !== 'object' || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) throw new KnowledgeError();
    const predecessor = queues.get(this.file) ?? Promise.resolve();
    const operation = predecessor.catch(() => undefined).then(async () => {
      requireHouseholdAccess();
      const current = await this.load();
      const store: KnowledgeV3 = { ...current, schemaVersion: 3, memories: [...current.memories] };
      if (store.revision !== body.expectedRevision) throw new KnowledgeError('FAMILY_KNOWLEDGE_REVISION_CONFLICT', 409);
      const now = new Date().toISOString();
      const result = change(store, body, now);
      store.revision++;
      const candidate = { ...store, schemaVersion: current.schemaVersion === 3 || memoryMutation ? 3 : 2 };
      validateKnowledge(candidate, getHouseholdConfig());
      const bytes = `${JSON.stringify(candidate, null, 2)}\n`;
      if (Buffer.byteLength(bytes) > MAX_KNOWLEDGE_BYTES) throw new KnowledgeError('FAMILY_KNOWLEDGE_LIMIT');
      requireHouseholdAccess();
      await this.replace(bytes);
      return { revision: store.revision, result };
    });
    queues.set(this.file, operation);
    try { return await operation; }
    finally { if (queues.get(this.file) === operation) queues.delete(this.file); }
  }
  private async replace(bytes: string): Promise<void> {
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    const backupTemporary = `${this.file}.${randomUUID()}.backup-tmp`;
    let published = false;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(bytes, 'utf8'); await handle.sync(); } finally { await handle.close(); }
      await copyFile(this.file, backupTemporary, constants.COPYFILE_EXCL);
      await flushCopiedFile(backupTemporary);
      await rename(backupTemporary, `${this.file}.bak`);
      await flushDirectory(dirname(this.file));
      await rename(temporary, this.file);
      published = true;
      await flushDirectory(dirname(this.file));
    } catch (error) {
      if (published) throw new KnowledgeError('FAMILY_KNOWLEDGE_COMMIT_UNCERTAIN', 503);
      throw error;
    } finally {
      await unlink(temporary).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
      await unlink(backupTemporary).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
    }
  }
  createProfile(input: unknown) {
    return this.mutate(input, (store, body, now) => {
      record(body, ['expectedRevision','subject']);
      const subject = validateSubject(body.subject, getHouseholdConfig());
      if (store.profiles.some(p => subjectKey(p.subject) === subjectKey(subject))) throw new KnowledgeError('DUPLICATE_PROFILE', 409);
      const profile: Profile = { id: randomUUID(), subject, createdAt: now, updatedAt: now, facts: [] };
      store.profiles.push(profile); return profile;
    });
  }
  addFact(profileId: string, input: unknown, supersedes?: string) {
    return this.mutate(input, (store, body, now) => {
      record(body, ['expectedRevision','fact']);
      const profile = store.profiles.find(p => p.id === profileId);
      if (!profile) throw new KnowledgeError('PROFILE_NOT_FOUND', 404);
      const fact = captureFact(body.fact, now);
      if (supersedes !== undefined) {
        const previous = profile.facts.find(f => f.id === supersedes);
        if (!previous || previous.lifecycle !== 'ACTIVE' || previous.kind !== fact.kind) throw new KnowledgeError('INVALID_SUPERSESSION', 409);
        previous.lifecycle = 'SUPERSEDED'; previous.supersededBy = fact.id; previous.updatedAt = now; previous.endedAt = now;
        fact.supersedes = previous.id;
      }
      profile.facts.push(fact); profile.updatedAt = now; return fact;
    });
  }
  retractFact(profileId: string, factId: string, input: unknown) {
    return this.mutate(input, (store, body, now) => {
      record(body, ['expectedRevision']);
      const profile = store.profiles.find(p => p.id === profileId);
      const fact = profile?.facts.find(f => f.id === factId);
      if (!profile || !fact || fact.lifecycle !== 'ACTIVE') throw new KnowledgeError('FACT_NOT_ACTIVE', 409);
      fact.lifecycle = 'RETRACTED'; fact.updatedAt = now; fact.endedAt = now; profile.updatedAt = now; return fact;
    });
  }
  createRelationship(input: unknown) {
    return this.mutate(input, (store, body, now) => {
      record(body, ['expectedRevision','relationship']);
      const value = record(body.relationship, ['type','fromMemberId','toMemberId','audience','sensitivity','validFrom','validUntil','provenance']);
      // Historical subjects are canonical references too; classification is never permission.
      validateMemberContext(value.fromMemberId, { historical: true }); validateMemberContext(value.toMemberId, { historical: true });
      const relation = { ...value, id: randomUUID(), createdAt: now, updatedAt: now, endedAt: null, lifecycle: 'ACTIVE', provenance: captureProvenance(value.provenance, now) } as Relationship;
      store.relationships.push(relation); return relation;
    });
  }
  retractRelationship(id: string, input: unknown) {
    return this.mutate(input, (store, body, now) => {
      record(body, ['expectedRevision']);
      const relation = store.relationships.find(r => r.id === id);
      if (!relation || relation.lifecycle !== 'ACTIVE') throw new KnowledgeError('RELATIONSHIP_NOT_ACTIVE', 409);
      relation.lifecycle = 'RETRACTED'; relation.updatedAt = now; relation.endedAt = now; return relation;
    });
  }
  async memories(input: unknown) {
    requireHouseholdAccess();
    const query = validateMemoryQuery(input, getHouseholdConfig());
    const store = await this.load();
    const now = new Date().toISOString();
    const matches = store.memories.filter(m => subjectKey(m.subject) === subjectKey(query.subject) &&
      (query.type === null || m.type === query.type) && (query.domain === null || m.assertion.domain === query.domain) &&
      (query.lifecycle === 'ALL' || m.lifecycle === query.lifecycle) &&
      (query.lifecycle !== 'ACTIVE' || memoryApplicability(m, now) === 'IN_WINDOW'))
      .sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const page = matches.slice(query.offset, query.offset + query.limit);
    const nextOffset = query.offset + page.length < matches.length ? query.offset + page.length : null;
    return { revision: store.revision, memories: page.map(memory => ({ ...memory, applicability: memoryApplicability(memory, now) })), truncated: nextOffset !== null, nextOffset };
  }
  async memory(id: string) {
    requireHouseholdAccess();
    const current = await this.load();
    const memory = current.memories.find(item => item.id === id);
    if (!memory) throw new KnowledgeError('MEMORY_NOT_FOUND', 404);
    return { revision: current.revision, memory: { ...memory, applicability: memoryApplicability(memory, new Date().toISOString()) } };
  }
  createMemory(input: unknown, supersedes?: string) {
    return this.mutate(input, (store, body, now) => {
      record(body, ['expectedRevision','memory']);
      const value = record(body.memory, ['type','subject','assertion','context','displayText','audience','sensitivity','provenance','evidence','validFrom','validUntil','reviewAfter']);
      validateSubject(value.subject, getHouseholdConfig());
      const memory = { ...value, id: randomUUID(), lifecycle: 'ACTIVE', provenance: captureProvenance(value.provenance, now),
        createdAt: now, updatedAt: now, endedAt: null, supersedes: null, supersededBy: null } as FamilyMemory;
      validateMemories([memory], getHouseholdConfig());
      // An ACTIVE assertion cannot be captured already outside its stated end validity.
      if (memory.validUntil !== null && memory.validUntil <= now) throw new KnowledgeError('INVALID_MEMORY_EXPIRY');
      if (supersedes !== undefined) {
        const previous = store.memories.find(m => m.id === supersedes);
        if (!previous || previous.lifecycle !== 'ACTIVE' || !sameMemoryFamily(previous, memory)) throw new KnowledgeError('INVALID_MEMORY_SUPERSESSION', 409);
        const editable = (m: FamilyMemory) => ({ assertion:m.assertion, context:m.context, displayText:m.displayText, audience:m.audience, sensitivity:m.sensitivity,
          provenance:{origin:m.provenance.origin,suppliedByMemberId:m.provenance.suppliedByMemberId,sourceStatement:m.provenance.sourceStatement}, evidence:m.evidence,validFrom:m.validFrom,validUntil:m.validUntil,reviewAfter:m.reviewAfter });
        if (canonicalMemoryValue(editable(previous)) === canonicalMemoryValue(editable(memory))) throw new KnowledgeError('NO_MEMORY_CHANGE', 409);
        previous.lifecycle = 'SUPERSEDED'; previous.supersededBy = memory.id; previous.endedAt = now; previous.updatedAt = now;
        memory.supersedes = previous.id;
      }
      store.memories.push(memory);
      return memory;
    }, true);
  }
  endMemory(id: string, input: unknown, lifecycle: 'RETRACTED' | 'EXPIRED') {
    return this.mutate(input, (store, body, now) => {
      record(body, ['expectedRevision']);
      const memory = store.memories.find(m => m.id === id);
      if (!memory || memory.lifecycle !== 'ACTIVE') throw new KnowledgeError('MEMORY_NOT_ACTIVE', 409);
      if (lifecycle === 'EXPIRED' && (!memory.validUntil || memory.validUntil > now)) throw new KnowledgeError('MEMORY_NOT_DUE', 409);
      memory.lifecycle = lifecycle; memory.updatedAt = now; memory.endedAt = now;
      return memory;
    }, true);
  }
  async graph(input: unknown) {
    requireHouseholdAccess();
    const { validateGraphQuery, queryGraph } = await import('./familyGraph.js');
    const query = validateGraphQuery(input, getHouseholdConfig()); // Validate bounds before datastore access.
    return queryGraph(await this.load(), query, getHouseholdConfig());
  }
}
export const familyKnowledgeStore = guardedLiveService(() => new FamilyKnowledgeStore());
