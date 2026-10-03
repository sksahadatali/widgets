import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createCalendarReadEnvelope, CALENDAR_READ_SIGNATURE_DOMAIN } from '../../server/src/services/calendarReadAuth.js';
import { getSafeCalendarData } from '../../server/src/services/calendarProvider.js';
import { setHouseholdConfigForTests } from '../../server/src/config/householdConfig.js';
import { installCalendarReadTestSecret, SYNTHETIC_READ_SECRET } from './helpers/calendarReadSecret.js';

installCalendarReadTestSecret();
const writeSecret = 'synthetic-write-only-test-key-000000000000000';
const now = Date.parse('2026-10-03T12:00:00.000Z');
const source = readFile(new URL('../../docs/apps-script/calendar-authenticated-reads.gs', import.meta.url), 'utf8');
const writeDoc = readFile(new URL('../../docs/calendar-apps-script-v2-version-9-writes.md', import.meta.url), 'utf8');

const windowDoc = readFile(new URL('../../docs/calendar-apps-script-v2-version-8.md', import.meta.url), 'utf8');


function payload(overrides: Record<string, unknown> = {}) {
  return { version: 1, audience: 'eyos-calendar-read-v1', operation: 'read-calendar', requestId: randomUUID(), issuedAt: new Date(now).toISOString(), window: {}, ...overrides };
}
function signed(value: unknown, key = SYNTHETIC_READ_SECRET, domain = CALENDAR_READ_SIGNATURE_DOMAIN) {
  const encoded = Buffer.from(JSON.stringify(value)).toString('base64url');
  return { payload: encoded, signature: createHmac('sha256', key).update(domain + encoded).digest('base64url') };
}
function event(envelope: unknown) { return { postData: { contents: JSON.stringify(envelope) } }; }

async function harness() {
  const [readCode, writeCode, windowCode] = await Promise.all([source, writeDoc, windowDoc]);
  const block = (text: string, marker: string) => [...text.matchAll(/```javascript\r?\n([\s\S]*?)```/g)].map(match => match[1]).find(value => value.includes(marker))!;
  const writeBlock = block(writeCode, 'function consumeRequestId_');
  const windowBlock = block(windowCode, 'function requestedWindow_');
  const properties = new Map<string, string>([
    ['EYOS_CALENDAR_READ_HMAC_SECRET', SYNTHETIC_READ_SECRET],
    ['EYOS_CALENDAR_WRITE_HMAC_SECRET', writeSecret],
    ['EDITABLE_CALENDAR_IDS', '["synthetic-calendar"]'],
  ]);
  const cache = new Map<string, string>();
  let held = false;
  let allowLock = true;
  let readFailure = false;
  let writeFailure = false;
  let silentWriteFailure = false;
  let reads = 0;
  let inspections = 0;
  let readWhileLocked = false;
  let currentNow = now;
  let duringSet: (() => void) | null = null;
  let afterLock: (() => void) | null = null;
  const context: Record<string, any> = {
    Date: class extends Date { static now() { return currentNow; } },
    CONFIG: { DAYS_TO_FETCH: 7, HOUSEHOLD_TIME_ZONE: 'Europe/London', CONTRACT_VERSION: 2, PROVIDER: 'google-calendar', WRITE_VERSION: 1, WRITE_MAX_AGE_MS: 300000, WRITE_MAX_PAYLOAD_CHARS: 24000 },
    console: { warn() {} },
    Utilities: {
      base64DecodeWebSafe: (value: string) => [...Buffer.from(value, 'base64url')],
      base64EncodeWebSafe: (value: number[]) => Buffer.from(value).toString('base64url'),
      newBlob: (value: number[]) => ({ getDataAsString: () => Buffer.from(value).toString('utf8') }),
      computeHmacSha256Signature: (value: string, key: string) => [...createHmac('sha256', key).update(value).digest()],
      formatDate: (date: unknown) => {
        if (!(date instanceof Date)) throw new Error('Invalid argument: date. Should be of type: Date');
        return '2026-10-03';
      },
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key: string) => { if (readFailure) throw new Error('private detail'); return properties.get(key) ?? null; },
      setProperty: (key: string, value: string) => {
        if (duringSet) { const callback = duringSet; duringSet = null; callback(); }
        if (writeFailure) throw new Error('private detail');
        if (!silentWriteFailure) properties.set(key, value);
      },
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => {
      if (!allowLock || held) return false;
      held = true;
      if (afterLock) afterLock();
      return true;
    }, releaseLock: () => { held = false; } }) },
    CacheService: { getScriptCache: () => ({ get: (key: string) => cache.get(key) ?? null, put: (key: string, value: string) => cache.set(key, value) }) },
    jsonResponse_: (value: unknown) => value,
    isValidCivilDate_: (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
    getCalendars_: () => [{ id: 'synthetic-calendar' }],
    Calendar: { CalendarList: { get: () => ({ accessRole: 'writer' }) } },
  };
  runInNewContext(writeBlock.replace('function doPost(e)', 'function legacyCalendarWritePost_(e)'), context);
  runInNewContext(windowBlock, context);
  context.inspectEvent_ = () => { inspections += 1; return { success: true, event: { synthetic: true } }; };
  context.legacyCalendarGet_ = (e: unknown) => {
    reads += 1; readWhileLocked ||= held;
    const window = context.requestedWindow_(e);
    return { success: true, contractVersion: 2, window, events: [] };
  };
  runInNewContext(readCode, context);
  return {
    post: (envelope: unknown, parameters: Record<string, unknown> = {}) => context.doPost({ ...event(envelope), ...parameters }),
    get: () => context.doGet({ parameters: {} }),
    properties,
    reload: () => runInNewContext(readCode, context),
    state: () => ({ reads, inspections, held, readWhileLocked }),
    lock: (value: boolean) => { allowLock = value; },
    failRead: () => { readFailure = true; },
    failWrite: () => { writeFailure = true; },
    silentFailWrite: () => { silentWriteFailure = true; },
    duringSet: (callback: () => void) => { duringSet = callback; },
    afterLock: (callback: () => void) => { afterLock = callback; },
    time: (value: number) => { currentNow = value; },
  };
}

describe('Calendar authenticated read producer', () => {
  for (const window of [{}, { startDate: '2026-10-04' }, { startDate: '2026-10-04', days: 35 }, { startDate: '2026-10-04', days: 42 }]) {
    it(`accepts signed window ${JSON.stringify(window)} using the existing window parser`, async () => {
      const h = await harness();
      const result = h.post(signed(payload({ window })));
      assert.equal(result.success, true);
      assert.equal(result.window.startDate, 'startDate' in window ? window.startDate : '2026-10-03');
      assert.equal(result.window.days, 'days' in window ? window.days : 7);
      assert.equal(h.state().readWhileLocked, false);
    });
  }
  for (const [label, change] of Object.entries({
    expired: { issuedAt: new Date(now - 60001).toISOString() },
    future: { issuedAt: new Date(now + 15001).toISOString() },
    version: { version: 2 }, audience: { audience: 'write-calendar' }, operation: { operation: 'inspect-event' },
    unknownField: { extra: true }, badUuid: { requestId: 'not-a-uuid' }, badTimestamp: { issuedAt: '2026-02-30T12:00:00.000Z' },
    pastWindow: { window: { startDate: '2026-10-02' } }, invalidDate: { window: { startDate: '2026-02-30' } },
    unboundedWindow: { window: { startDate: '2026-10-04', days: 43 } }, noStart: { window: { days: 7 } }, extraWindow: { window: { unsafe: true } },
  })) {
    it(`rejects ${label} before any Calendar read`, async () => {
      const h = await harness();
      assert.equal(h.post(signed(payload(change))).success, false);
      assert.equal(h.state().reads, 0);
      assert.equal(h.state().inspections, 0);
    });
  }
  for (const secret of [undefined, '', 'short', writeSecret]) {
    it(`fails closed for ${secret === undefined ? 'missing' : 'invalid/reused'} read secret`, async () => {
      const h = await harness();
      if (secret === undefined) h.properties.delete('EYOS_CALENDAR_READ_HMAC_SECRET');
      else h.properties.set('EYOS_CALENDAR_READ_HMAC_SECRET', secret);
      assert.equal(h.post(signed(payload())).success, false);
      assert.equal(h.state().reads, 0);
    });
  }
  it('rejects incorrect, modified and cross-domain signatures', async () => {
    const h = await harness();
    const changed = signed(payload());
    changed.payload = Buffer.from(JSON.stringify(payload({ window: { startDate: '2026-10-05' } }))).toString('base64url');
    for (const envelope of [changed, signed(payload(), writeSecret), signed(payload(), SYNTHETIC_READ_SECRET, '')]) {
      assert.equal(h.post(envelope).success, false);
    }
    assert.equal(h.state().reads, 0);
  });
  it('rejects malformed and oversized envelopes/payloads', async () => {
    const h = await harness();
    for (const envelope of [null, {}, [], { ...signed(payload()), extra: true }, { payload: '!', signature: '!' }, signed(null), signed([]), signed({ huge: 'x'.repeat(4000) })]) {
      assert.equal(h.post(envelope).success, false);
    }
    assert.equal(h.state().reads, 0);
  });
  it('rejects replay after producer reinitialization and UUID case changes', async () => {
    const h = await harness();
    const request = payload();
    assert.equal(h.post(signed(request)).success, true);
    h.reload();
    assert.equal(h.post(signed(request)).success, false);
    assert.equal(h.post(signed({ ...request, requestId: request.requestId.toUpperCase() })).success, false);
    assert.equal(h.state().reads, 1);
  });
  it('cannot admit a competing replay during atomic reservation', async () => {
    const h = await harness();
    const envelope = signed(payload());
    let concurrent: any;
    h.duringSet(() => { concurrent = h.post(envelope); });
    assert.equal(h.post(envelope).success, true);
    assert.equal(concurrent.success, false);
    assert.equal(h.post(envelope).success, false);
    assert.equal(h.state().reads, 1);
    assert.equal(h.state().held, false);
  });
  it('keeps a nonce at the validity boundary and prunes only expired entries', async () => {
    const h = await harness();
    const request = payload();
    assert.equal(h.post(signed(request)).success, true);
    h.time(now + 60000);
    assert.equal(h.post(signed(request)).success, false);
    const fresh = payload({ issuedAt: new Date(now + 60000).toISOString() });
    assert.equal(h.post(signed(fresh)).success, true);
    h.time(now + 60001);
    assert.equal(h.post(signed(payload({ issuedAt: new Date(now + 60001).toISOString() }))).success, true);
    const ledger = JSON.parse(h.properties.get('EYOS_CALENDAR_READ_NONCES_V1')!);
    assert.equal(Object.hasOwn(ledger.nonces, request.requestId), false);
  });
  it('retains future-clock nonces for their entire extended validity period', async () => {
    const h = await harness();
    const request = payload({ issuedAt: new Date(now + 15000).toISOString() });
    assert.equal(h.post(signed(request)).success, true);
    h.time(now + 75000);
    assert.equal(h.post(signed(request)).success, false);
    assert.equal(h.state().reads, 1);
  });
  it('rejects a request that expires during lock acquisition', async () => {
    const h = await harness();
    const request = payload({ issuedAt: new Date(now - 60000).toISOString() });
    h.afterLock(() => h.time(now + 1));
    assert.equal(h.post(signed(request)).success, false);
    assert.equal(h.state().reads, 0);
    assert.equal(h.state().held, false);
  });
  for (const failure of ['lock', 'read', 'write', 'silent-write', 'corrupt', 'oversized', 'capacity']) {
    it(`fails closed on nonce ${failure} failure`, async () => {
      const h = await harness();
      if (failure === 'lock') h.lock(false);
      if (failure === 'read') h.failRead();
      if (failure === 'write') h.failWrite();
      if (failure === 'silent-write') h.silentFailWrite();
      if (failure === 'corrupt') h.properties.set('EYOS_CALENDAR_READ_NONCES_V1', '{bad');
      if (failure === 'oversized') h.properties.set('EYOS_CALENDAR_READ_NONCES_V1', 'x'.repeat(6001));
      if (failure === 'capacity') h.properties.set('EYOS_CALENDAR_READ_NONCES_V1', JSON.stringify({ version: 1, nonces: Object.fromEntries(Array.from({ length: 64 }, () => [randomUUID(), now + 60000])) }));
      const result = h.post(signed(payload()));
      assert.equal(result.success, false);
      assert.equal(h.state().reads, 0);
      assert.equal(h.state().held, false);
      assert.doesNotMatch(JSON.stringify(result), /private detail|synthetic-read|payload|signature/);
    });
  }
  it('denies unsigned GET by default/final/invalid mode, enables only explicit compatibility', async () => {
    const h = await harness();
    for (const mode of [undefined, 'final', 'invalid']) {
      if (mode === undefined) h.properties.delete('EYOS_CALENDAR_READ_MODE');
      else h.properties.set('EYOS_CALENDAR_READ_MODE', mode);
      assert.equal(h.get().success, false);
    }
    assert.equal(h.state().reads, 0);
    h.properties.set('EYOS_CALENDAR_READ_MODE', 'compatibility');
    assert.equal(h.get().success, true);
    assert.equal(h.post(signed(payload(), writeSecret)).success, false);
    assert.equal(h.state().reads, 1); // Failed POST never falls back to GET.
  });
  it('preserves the real Version 9 write verifier and rejects read credentials for inspection', async () => {
    const h = await harness();
    const write = { version: 1, requestId: randomUUID(), issuedAt: new Date(now).toISOString(), operation: 'inspect-event', locator: { calendarId: 'synthetic-calendar', providerEventId: 'synthetic-event' }, body: {} };
    for (const operation of ['inspect-event', 'update-event']) {
      assert.equal(h.post(signed({ ...write, operation }, SYNTHETIC_READ_SECRET)).success, false);
      assert.equal(h.post(signed({ ...write, operation }, SYNTHETIC_READ_SECRET, '')).success, false);
    }
    assert.equal(h.state().inspections, 0);
    assert.equal(h.post(signed(write, writeSecret, '')).success, true);
    assert.equal(h.post(signed(write, writeSecret, '')).success, false);
    assert.equal(h.state().inspections, 1);
  });
});

describe('Calendar read backend transport', () => {
  it('executes backend-generated envelopes through the producer and ignores unsigned URL window overrides', async () => {
    const h = await harness();
    h.time(Date.now());
    const envelope = createCalendarReadEnvelope({ startDate: '2026-10-04', days: 35 });
    const result = h.post(envelope, { queryString: 'days=42', parameters: { days: ['42'] } });
    assert.equal(result.success, true);
    assert.equal(result.window.startDate, '2026-10-04');
    assert.equal(result.window.days, 35);
  });
  it('creates independent signed envelopes with fresh UUIDs and no provider identifiers', () => {
    const first = createCalendarReadEnvelope({ startDate: '2026-10-04', days: 35 });
    const second = createCalendarReadEnvelope({});
    const value = JSON.parse(Buffer.from(first.payload, 'base64url').toString());
    assert.equal(value.operation, 'read-calendar');
    assert.equal(value.audience, 'eyos-calendar-read-v1');
    assert.deepEqual(value.window, { startDate: '2026-10-04', days: 35 });
    assert.notEqual(value.requestId, JSON.parse(Buffer.from(second.payload, 'base64url').toString()).requestId);
    assert.equal(first.signature, createHmac('sha256', SYNTHETIC_READ_SECRET).update(CALENDAR_READ_SIGNATURE_DOMAIN + first.payload).digest('base64url'));
    assert.doesNotMatch(JSON.stringify(value), /calendarId|locator|HMAC_SECRET/);
  });
  it('rejects missing, short and reused write keys before network access', () => {
    const previous = process.env.EYOS_CALENDAR_WRITE_HMAC_SECRET;
    try {
      for (const secret of [undefined, 'short', writeSecret]) {
        if (secret === undefined) delete process.env.EYOS_CALENDAR_READ_HMAC_SECRET;
        else process.env.EYOS_CALENDAR_READ_HMAC_SECRET = secret;
        process.env.EYOS_CALENDAR_WRITE_HMAC_SECRET = writeSecret;
        assert.throws(() => createCalendarReadEnvelope({}), /not configured/);
      }
    } finally {
      if (previous === undefined) delete process.env.EYOS_CALENDAR_WRITE_HMAC_SECRET;
      else process.env.EYOS_CALENDAR_WRITE_HMAC_SECRET = previous;
    }
  });
  it('rejects an HTTP-success auth failure instead of treating it as empty Calendar data', async () => {
    setHouseholdConfigForTests({ schemaVersion: 1, household: { displayName: 'Test', members: [{ id: 'adult', displayName: 'Adult', memberType: 'adult' }] }, location: { name: 'Test', latitude: 51, longitude: -1, timezone: 'Europe/London' }, travel: { homeAddress: 'Synthetic', leaveBufferMinutes: 10, destinations: [] }, calendar: { endpoint: 'https://synthetic.example.test/provider', refreshMinutes: 15, sources: [], semanticRules: [] } });
    let calls = 0;
    try {
      await assert.rejects(getSafeCalendarData({}, async (input, init) => {
        calls += 1;
        assert.equal(input, 'https://synthetic.example.test/provider');
        assert.equal(init?.method, 'POST');
        assert.equal(init?.redirect, 'follow');
        return new Response(JSON.stringify({ success: false, code: 'CALENDAR_READ_DENIED', events: [] }));
      }), /invalid response/);
      assert.equal(calls, 1);
    } finally { setHouseholdConfigForTests(null, 'demo'); }
  });
  it('does not issue any network request or unsigned fallback when the server key is missing', async () => {
    setHouseholdConfigForTests({ schemaVersion: 1, household: { displayName: 'Test', members: [{ id: 'adult', displayName: 'Adult', memberType: 'adult' }] }, location: { name: 'Test', latitude: 51, longitude: -1, timezone: 'Europe/London' }, travel: { homeAddress: 'Synthetic', leaveBufferMinutes: 10, destinations: [] }, calendar: { endpoint: 'https://synthetic.example.test/provider', refreshMinutes: 15, sources: [], semanticRules: [] } });
    delete process.env.EYOS_CALENDAR_READ_HMAC_SECRET;
    let calls = 0;
    try {
      await assert.rejects(getSafeCalendarData({}, async () => { calls += 1; return new Response('{}'); }), /not configured/);
      assert.equal(calls, 0);
    } finally { setHouseholdConfigForTests(null, 'demo'); }
  });
});
