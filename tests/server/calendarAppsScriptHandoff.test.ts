import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const handoffUrl = new URL('../../docs/calendar-apps-script-v2-version-9-writes.md', import.meta.url);

describe('Calendar Apps Script Version 9 handoff', () => {
  it('requires an independent read-subset allowlist and only exact writer/owner roles', async () => {
    const source = await readFile(handoffUrl, 'utf8');
    assert.match(source, /EDITABLE_CALENDAR_IDS/);
    assert.match(source, /selectedForRead && editableCalendarIds_\(\)\[calendarId\] === true && liveWriteRole_\(calendarId\)/);
    assert.match(source, /role === 'owner' \|\| role === 'writer'/);
    assert.match(source, /writerWithoutPrivateAccess/);
  });

  it('uses signed bounded POST requests and direct REST If-Match without exposing tokens', async () => {
    const source = await readFile(handoffUrl, 'utf8');
    assert.match(source, /function doPost\(e\)/);
    assert.match(source, /computeHmacSha256Signature/);
    assert.match(source, /WRITE_MAX_PAYLOAD_CHARS/);
    assert.match(source, /'If-Match': patch\.etag/);
    assert.match(source, /ScriptApp\.getOAuthToken\(\)/);
    assert.match(source, /Never log provider bodies, locators, ETags, payloads, signatures or secrets/);
  });

  it('rejects a repeated request ID before provider authorization or execution', async () => {
    const source = await readFile(handoffUrl, 'utf8');
    const javascriptBlocks = [...source.matchAll(/```javascript\r?\n([\s\S]*?)```/g)].map(match => match[1]);
    const implementation = javascriptBlocks.find(block => block.includes('function consumeRequestId_(requestId)'));
    assert.ok(implementation, 'Version 9 replay implementation is missing.');
    const cache = new Map<string, string>();
    let releases = 0;
    const load = new Function('LockService', 'CacheService', `${implementation}; return consumeRequestId_;`) as (
      lockService: unknown,
      cacheService: unknown,
    ) => (requestId: string) => void;
    const consume = load(
      { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => { releases += 1; } }) },
      { getScriptCache: () => ({ get: (key: string) => cache.get(key) ?? null, put: (key: string, value: string) => { cache.set(key, value); } }) },
    );

    consume('11111111-1111-4111-8111-111111111111');
    assert.throws(
      () => consume('11111111-1111-4111-8111-111111111111'),
      (error: unknown) => error instanceof Error && (error as Error & { writeCode?: string }).writeCode === 'INVALID_REQUEST',
    );
    assert.equal(cache.size, 1);
    assert.equal(releases, 2);
  });

  it('pins least-privilege manifest scopes and denies unsupported event kinds and series semantics', async () => {
    const source = await readFile(handoffUrl, 'utf8');
    assert.match(source, /calendar\.readonly/);
    assert.match(source, /calendar\.events/);
    assert.match(source, /script\.external_request/);
    assert.match(source, /eventType !== 'default'/);
    assert.match(source, /body\.scope !== \(occurrence \? 'occurrence' : 'event'\)/);
    assert.doesNotMatch(source, /Calendar\.Events\.(?:insert|delete)/);
  });
});
