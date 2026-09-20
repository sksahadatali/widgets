import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { setHouseholdConfigForTests, type HouseholdConfig } from '../../server/src/config/householdConfig.js';
import { CalendarEditRegistry, calendarEditRegistry } from '../../server/src/services/calendarEditRegistry.js';
import { CalendarWriteError, getCalendarEditContext, parseCalendarEditRequest, updateCalendarEvent } from '../../server/src/services/calendarEventWriter.js';
import { getSafeCalendarData } from '../../server/src/services/calendarProvider.js';
import { CalendarProfileAssignmentFileStore } from '../../server/src/services/calendarProfileAssignmentStore.js';

const config: HouseholdConfig = {
  schemaVersion: 1,
  household: { displayName: 'Test', members: [{ id: 'adult', displayName: 'Adult', memberType: 'adult' }] },
  location: { name: 'London', latitude: 51, longitude: 0, timezone: 'Europe/London' },
  travel: { homeAddress: 'Private', leaveBufferMinutes: 10, destinations: [] },
  calendar: {
    endpoint: 'https://calendar.example.test/private-v2', refreshMinutes: 15,
    sources: [{ sourceId: 'family', label: 'Family', kind: 'family', calendarId: 'provider-calendar-private', writeAccess: 'edit-existing' }],
    semanticRules: [],
  },
};

const event = {
  identityVersion: 1, provider: 'google-calendar', providerEventId: 'provider-event-private', calendarId: 'provider-calendar-private',
  recurringEventId: null, originalStartTime: null, iCalUID: 'private-uid', etag: 'etag-private-1', updated: '2026-09-20T07:00:00Z',
  status: 'confirmed', writable: true, calendarName: 'Family private', title: 'Lesson',
  start: { kind: 'dateTime', value: '2026-09-20T09:00:00+01:00', timeZone: 'Europe/London' },
  end: { kind: 'dateTime', value: '2026-09-20T10:00:00+01:00', timeZone: 'Europe/London' },
  allDay: false, location: 'Home', description: 'Private',
};

function readResponse(item: unknown = event) {
  return { success: true, contractVersion: 2, provider: 'google-calendar', generatedAt: '2026-09-20T07:00:00Z', timeZone: 'Europe/London', window: { startDate: '2026-09-20', endDateExclusive: '2026-09-27', timeMin: '2026-09-19T23:00:00Z', timeMax: '2026-09-26T23:00:00Z' }, calendarUrl: '', events: [item] };
}
function producer(item = event) { return new Response(JSON.stringify({ success: true, event: item })); }
function decodeRequest(init?: RequestInit) {
  const envelope = JSON.parse(String(init?.body)) as { payload: string; signature: string };
  return { envelope, payload: JSON.parse(Buffer.from(envelope.payload, 'base64url').toString('utf8')) as Record<string, unknown> };
}

beforeEach(async () => {
  process.env.EYOS_CALENDAR_WRITE_HMAC_SECRET = 'synthetic-test-secret-that-is-at-least-32-characters';
  setHouseholdConfigForTests(config);
  calendarEditRegistry.clear();
});
afterEach(() => { delete process.env.EYOS_CALENDAR_WRITE_HMAC_SECRET; setHouseholdConfigForTests(null, 'demo'); calendarEditRegistry.clear(); });

async function load() {
  return (await getSafeCalendarData({}, async () => new Response(JSON.stringify(readResponse())))).events[0];
}

describe('Calendar provider write boundary', () => {
  it('derives editability from every gate and exposes no provider locator or ETag', async () => {
    const safe = await load();
    assert.equal(safe.writable, true);
    const context = await getCalendarEditContext(safe.eventKey, async (_url, init) => {
      const request = decodeRequest(init);
      assert.equal(request.payload.operation, 'inspect-event');
      assert.match(request.envelope.signature, /^[A-Za-z0-9_-]+$/);
      return producer();
    });
    assert.match(context.revision, /^calendar-edit-revision-v1-[a-f0-9]{64}$/);
    assert.equal(context.scope, 'event');
    const serialized = JSON.stringify(context);
    for (const privateValue of ['provider-calendar-private', 'provider-event-private', 'etag-private-1', 'private-uid']) assert.doesNotMatch(serialized, new RegExp(privateValue));
  });

  it('retries inspect only as a newly signed request with a new UUID, timestamp, payload and HMAC', async () => {
    const safe = await load();
    const attempts: Array<{ envelope: { payload: string; signature: string }; payload: Record<string, unknown> }> = [];
    const fetcher: typeof fetch = async (_url, init) => {
      attempts.push(decodeRequest(init));
      if (attempts.length === 1) throw new Error('synthetic transport failure');
      return producer();
    };

    await assert.rejects(() => getCalendarEditContext(safe.eventKey, fetcher), (error: unknown) => error instanceof CalendarWriteError && error.status === 502);
    await new Promise(resolve => setTimeout(resolve, 2));
    const context = await getCalendarEditContext(safe.eventKey, fetcher);

    assert.equal(context.eventKey, safe.eventKey);
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].payload.operation, 'inspect-event');
    assert.equal(attempts[1].payload.operation, 'inspect-event');
    assert.notEqual(attempts[0].payload.requestId, attempts[1].payload.requestId);
    assert.notEqual(attempts[0].payload.issuedAt, attempts[1].payload.issuedAt);
    assert.notEqual(attempts[0].envelope.payload, attempts[1].envelope.payload);
    assert.notEqual(attempts[0].envelope.signature, attempts[1].envelope.signature);
  });

  it('sends the fresh ETag privately and makes revisions single-use', async () => {
    const safe = await load();
    const context = await getCalendarEditContext(safe.eventKey, async () => producer());
    const request = { scope: 'event' as const, revision: context.revision, title: 'Renamed', location: '', timing: { kind: 'dateTime' as const, start: '2026-09-20T11:00:00+01:00', end: '2026-09-20T12:00:00+01:00', timeZone: 'Europe/London' as const } };
    const changed = { ...event, title: 'Renamed', location: '', start: { ...event.start, value: request.timing.start }, end: { ...event.end, value: request.timing.end }, etag: 'etag-private-2' };
    const confirmed = await updateCalendarEvent(safe.eventKey, request, async (_url, init) => {
      const signed = decodeRequest(init);
      assert.equal((signed.payload.body as Record<string, unknown>).etag, 'etag-private-1');
      assert.equal(signed.payload.operation, 'update-event');
      return producer(changed);
    }, new Date('2026-09-20T08:00:00Z'));
    assert.equal(confirmed.title, 'Renamed');
    await assert.rejects(() => updateCalendarEvent(safe.eventKey, request, async () => producer(changed)), (error: unknown) => error instanceof CalendarWriteError && error.status === 409);
  });

  it('maps provider precondition failures to a closed 409 without optimistic success', async () => {
    const safe = await load();
    const context = await getCalendarEditContext(safe.eventKey, async () => producer());
    await assert.rejects(
      () => updateCalendarEvent(safe.eventKey, { scope: 'event', revision: context.revision, title: 'No overwrite', location: 'Home', timing: { kind: 'dateTime', start: event.start.value, end: event.end.value, timeZone: 'Europe/London' } }, async () => new Response(JSON.stringify({ success: false, code: 'PRECONDITION_FAILED' })), new Date('2026-09-20T07:00:00Z')),
      (error: unknown) => error instanceof CalendarWriteError && error.status === 409,
    );
  });

  it('never automatically retries an ambiguous update or permits reuse of its consumed revision', async () => {
    const safe = await load();
    const context = await getCalendarEditContext(safe.eventKey, async () => producer());
    const request = { scope: 'event' as const, revision: context.revision, title: 'Ambiguous', location: 'Home', timing: { kind: 'dateTime' as const, start: event.start.value, end: event.end.value, timeZone: 'Europe/London' as const } };
    let providerAttempts = 0;
    let signedAttempt: ReturnType<typeof decodeRequest> | null = null;
    const ambiguousFetcher: typeof fetch = async (_url, init) => {
      providerAttempts += 1;
      signedAttempt = decodeRequest(init);
      throw new Error('synthetic connection loss after request dispatch');
    };

    await assert.rejects(() => updateCalendarEvent(safe.eventKey, request, ambiguousFetcher, new Date('2026-09-20T07:00:00Z')), (error: unknown) => error instanceof CalendarWriteError && error.status === 502);
    assert.equal(providerAttempts, 1);
    assert.equal(signedAttempt?.payload.operation, 'update-event');

    await assert.rejects(() => updateCalendarEvent(safe.eventKey, request, ambiguousFetcher, new Date('2026-09-20T07:00:00Z')), (error: unknown) => error instanceof CalendarWriteError && error.status === 409);
    assert.equal(providerAttempts, 1);
  });

  it('maps provider permission, removal and upstream failures without leaking provider bodies', async () => {
    const safe = await load();
    const cases = [
      { code: 'NOT_PERMITTED', status: 403 },
      { code: 'NOT_FOUND', status: 404 },
      { code: 'UPSTREAM_FAILURE', status: 502 },
    ] as const;
    for (const item of cases) {
      const context = await getCalendarEditContext(safe.eventKey, async () => producer());
      await assert.rejects(
        () => updateCalendarEvent(safe.eventKey, { scope: 'event', revision: context.revision, title: 'X', location: '', timing: { kind: 'dateTime', start: event.start.value, end: event.end.value, timeZone: 'Europe/London' } }, async () => new Response(JSON.stringify({ success: false, code: item.code, privateProviderBody: 'must-not-leak' })), new Date('2026-09-20T07:00:00Z')),
        (error: unknown) => error instanceof CalendarWriteError && error.status === item.status && !error.message.includes('must-not-leak'),
      );
    }
  });

  it('keeps a moved recurring occurrence identity stable and rejects series scope', async () => {
    const recurring = { ...event, providerEventId: 'occurrence-private', recurringEventId: 'series-private', originalStartTime: { kind: 'dateTime', value: '2026-09-20T09:00:00+01:00', timeZone: 'Europe/London' } };
    const safe = (await getSafeCalendarData({}, async () => new Response(JSON.stringify(readResponse(recurring))))).events[0];
    const context = await getCalendarEditContext(safe.eventKey, async () => producer(recurring));
    assert.equal(context.scope, 'occurrence');
    await assert.rejects(() => updateCalendarEvent(safe.eventKey, { scope: 'series', revision: context.revision } as never, async () => producer(recurring)), (error: unknown) => error instanceof CalendarWriteError && error.status === 400);
    const fresh = await getCalendarEditContext(safe.eventKey, async () => producer(recurring));
    const moved = { ...recurring, start: { ...recurring.start, value: '2026-09-21T09:00:00+01:00' }, end: { ...recurring.end, value: '2026-09-21T10:00:00+01:00' }, etag: 'etag-private-2' };
    const confirmed = await updateCalendarEvent(safe.eventKey, { scope: 'occurrence', revision: fresh.revision, title: 'Lesson', location: 'Home', timing: { kind: 'dateTime', start: moved.start.value, end: moved.end.value, timeZone: 'Europe/London' } }, async () => producer(moved), new Date('2026-09-20T07:00:00Z'));
    assert.equal(confirmed.eventKey, safe.eventKey);
  });

  it('preserves the existing eY OS profile assignment across a confirmed provider edit', async () => {
    const safe = await load();
    const root = await mkdtemp(join(tmpdir(), 'eyos-calendar-write-assignment-'));
    try {
      const store = new CalendarProfileAssignmentFileStore(join(root, 'assignments.json'), 'initialize');
      await store.set(safe.eventKey, { kind: 'members', profileIds: ['adult'] }, ['adult']);
      const context = await getCalendarEditContext(safe.eventKey, async () => producer());
      const changed = { ...event, title: 'Updated', etag: 'etag-private-2' };
      const confirmed = await updateCalendarEvent(safe.eventKey, { scope: 'event', revision: context.revision, title: 'Updated', location: 'Home', timing: { kind: 'dateTime', start: event.start.value, end: event.end.value, timeZone: 'Europe/London' } }, async () => producer(changed), new Date('2026-09-20T07:00:00Z'));
      assert.equal(confirmed.eventKey, safe.eventKey);
      assert.deepEqual((await store.read()).assignments[0].target, { kind: 'members', profileIds: ['adult'] });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rejects Demo, v1/read-only configuration and browser-supplied provider authority', async () => {
    const safe = await load();
    setHouseholdConfigForTests(null, 'demo');
    await assert.rejects(() => getCalendarEditContext(safe.eventKey, async () => producer()), (error: unknown) => error instanceof CalendarWriteError && error.status === 403);
    setHouseholdConfigForTests({ ...config, calendar: { ...config.calendar, sources: [{ ...config.calendar.sources[0], writeAccess: undefined }] } });
    calendarEditRegistry.clear();
    const readonly = (await getSafeCalendarData({}, async () => new Response(JSON.stringify(readResponse())))).events[0];
    assert.equal(readonly.writable, false);
    await assert.rejects(() => getCalendarEditContext(readonly.eventKey, async () => producer()), /reloaded/);
    setHouseholdConfigForTests(config);
    const v1 = { success: true, generatedAt: '2026-09-20T07:00:00Z', timeZone: 'Europe/London', events: [{ id: 'legacy-private', title: 'Legacy', start: '2026-09-20', end: '2026-09-21', allDay: true, writable: true, calendarId: 'provider-calendar-private' }] };
    const legacy = (await getSafeCalendarData({}, async () => new Response(JSON.stringify(v1)))).events[0];
    assert.equal(legacy.writable, false);
    await assert.rejects(() => getCalendarEditContext(legacy.eventKey, async () => producer()), (error: unknown) => error instanceof CalendarWriteError && error.status === 403);
    assert.throws(() => parseCalendarEditRequest({ scope: 'event', revision: `calendar-edit-revision-v1-${'a'.repeat(64)}`, title: 'X', location: '', timing: { kind: 'date', startDate: '2026-09-20', endDateExclusive: '2026-09-21' }, calendarId: 'attacker' }, true), /invalid/);
  });

  it('keeps producer read-only, cancelled, missing-ETag, school and unknown sources non-editable', async () => {
    for (const candidate of [{ ...event, writable: false }, { ...event, status: 'cancelled' }, { ...event, etag: null }]) {
      calendarEditRegistry.clear();
      const safe = (await getSafeCalendarData({}, async () => new Response(JSON.stringify(readResponse(candidate))))).events[0];
      assert.equal(safe.writable, false);
    }
    const schoolConfig: HouseholdConfig = { ...config, calendar: { ...config.calendar, sources: [{ sourceId: 'school', label: 'School', kind: 'school', calendarId: 'provider-calendar-private' }] } };
    setHouseholdConfigForTests(schoolConfig);
    calendarEditRegistry.clear();
    assert.equal((await getSafeCalendarData({}, async () => new Response(JSON.stringify(readResponse())))).events[0].writable, false);
    setHouseholdConfigForTests({ ...config, calendar: { ...config.calendar, sources: [] } });
    calendarEditRegistry.clear();
    assert.equal((await getSafeCalendarData({}, async () => new Response(JSON.stringify(readResponse())))).events[0].writable, false);
  });

  it('validates London civil time across BST, GMT, gaps, repeats, all-day and Today', () => {
    const revision = `calendar-edit-revision-v1-${'a'.repeat(64)}`;
    const timed = (start: string, end: string) => ({ scope: 'event', revision, title: 'X', location: '', timing: { kind: 'dateTime', start, end, timeZone: 'Europe/London' } });
    assert.doesNotThrow(() => parseCalendarEditRequest(timed('2026-07-01T09:00:00+01:00', '2026-07-01T10:00:00+01:00'), false, new Date('2026-06-30T12:00:00Z')));
    assert.doesNotThrow(() => parseCalendarEditRequest(timed('2026-12-01T09:00:00+00:00', '2026-12-01T10:00:00+00:00'), false, new Date('2026-11-30T12:00:00Z')));
    assert.throws(() => parseCalendarEditRequest(timed('2026-03-29T01:30:00+00:00', '2026-03-29T02:30:00+01:00'), false, new Date('2026-03-28T12:00:00Z')), /timing/);
    assert.doesNotThrow(() => parseCalendarEditRequest(timed('2026-10-25T01:30:00+00:00', '2026-10-25T02:30:00+00:00'), false, new Date('2026-10-24T12:00:00Z')));
    assert.doesNotThrow(() => parseCalendarEditRequest({ scope: 'event', revision, title: 'X', location: '', timing: { kind: 'date', startDate: '2026-10-25', endDateExclusive: '2026-10-27' } }, true, new Date('2026-10-24T12:00:00Z')));
    assert.throws(() => parseCalendarEditRequest(timed('2026-12-01T10:00:00+00:00', '2026-12-01T09:00:00+00:00'), false, new Date('2026-11-30T12:00:00Z')), /timing/);
    assert.throws(() => parseCalendarEditRequest({ scope: 'event', revision, title: 'X', location: '', timing: { kind: 'date', startDate: '2026-10-25', endDateExclusive: '2026-10-26' } }, false, new Date('2026-10-24T12:00:00Z')), /timing/);
    assert.throws(() => parseCalendarEditRequest(timed('2026-09-19T09:00:00+01:00', '2026-09-19T10:00:00+01:00'), false, new Date('2026-09-20T08:00:00Z')), /timing/);
  });

  it('bounds and expires private locator and revision memory', () => {
    const registry = new CalendarEditRegistry(10, 10, 2, 2);
    const locator = (character: string) => ({ provider: 'google-calendar' as const, eventKey: `calendar-event-v1-${character.repeat(64)}`, sourceId: 'family', calendarId: `calendar-${character}`, providerEventId: `event-${character}`, recurringEventId: null, originalStartTime: null, allDay: false, providerEtag: `etag-${character}` });
    registry.register(locator('a'), 0); registry.register(locator('b'), 0); registry.register(locator('c'), 0);
    assert.equal(registry.resolve(locator('a').eventKey, 1), null);
    assert.ok(registry.resolve(locator('c').eventKey, 1));
    const revision = registry.issue(locator('c'), 'etag', 1);
    assert.equal(registry.consume(revision, locator('c').eventKey, 12), null);
  });
});
