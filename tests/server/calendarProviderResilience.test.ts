import { installCalendarReadTestSecret } from './helpers/calendarReadSecret.js';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import { afterEach, describe, it } from 'node:test';

import {
  setHouseholdConfigForTests,
  type HouseholdConfig,
} from '../../server/src/config/householdConfig.js';
import { readCalendarRoute } from '../../server/src/routes/calendar.js';
import {
  CalendarProviderTimeoutError,
  getTimedSafeCalendarData,
  type TimedCalendarData,
} from '../../server/src/services/calendarProvider.js';
import { CalendarReadCoordinator } from '../../server/src/services/calendarReadCoordinator.js';

const householdToday = '2026-09-20';
const now = new Date('2026-09-20T08:00:00.000Z');
installCalendarReadTestSecret();

const config: HouseholdConfig = {
  schemaVersion: 1,
  household: {
    displayName: 'Test Household',
    members: [{ id: 'child', displayName: 'Child', memberType: 'child' }],
  },
  location: {
    name: 'Test Town', latitude: 51, longitude: -1,
    timezone: 'Europe/London',
  },
  travel: {
    homeAddress: 'Private address', leaveBufferMinutes: 10, destinations: [],
  },
  calendar: {
    endpoint: 'https://private-provider.example.test/calendar?deployment=secret',
    refreshMinutes: 15,
    sources: [],
    semanticRules: [],
  },
};

const calendarData = {
  calendarUrl: '',
  generatedAt: '2026-09-20T08:00:00.000Z',
  timeZone: 'UTC',
  events: [],
};

const timedData: TimedCalendarData = {
  data: calendarData,
  timing: { providerMs: 25.25, processingMs: 1.5 },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

function v2Response(startDate = householdToday, days = 7) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days);
  const endDate = end.toISOString().slice(0, 10);
  return {
    success: true,
    contractVersion: 2,
    provider: 'google-calendar',
    generatedAt: '2026-09-20T08:00:00.000Z',
    timeZone: 'UTC',
    window: {
      startDate,
      endDateExclusive: endDate,
      timeMin: `${startDate}T00:00:00.000Z`,
      timeMax: `${endDate}T00:00:00.000Z`,
    },
    calendarUrl: '',
    events: [],
  };
}

afterEach(() => setHouseholdConfigForTests(null, 'demo'));

describe('Calendar backend in-flight coordination', () => {
  it('shares one provider operation for equivalent current household windows', async () => {
    const pending = deferred<TimedCalendarData>();
    let calls = 0;
    const coordinator = new CalendarReadCoordinator({
      read: async () => { calls += 1; return pending.promise; },
      now: () => now,
      timeZone: () => 'Europe/London',
    });

    const first = coordinator.get({});
    const second = coordinator.get({ startDate: householdToday, days: 7 });
    assert.equal(calls, 1);
    assert.strictEqual(first, second);
    pending.resolve(timedData);
    assert.deepEqual(await Promise.all([first, second]), [timedData, timedData]);
    assert.equal(coordinator.activeCount(), 0);
  });

  it('does not deduplicate distinct Calendar windows', async () => {
    const pending = [deferred<TimedCalendarData>(), deferred<TimedCalendarData>()];
    let calls = 0;
    const coordinator = new CalendarReadCoordinator({
      read: async () => pending[calls++].promise,
      now: () => now,
      timeZone: () => 'Europe/London',
    });
    const first = coordinator.get({ startDate: householdToday });
    const second = coordinator.get({ startDate: '2026-09-27' });
    assert.equal(calls, 2);
    pending[0].resolve(timedData);
    pending[1].resolve(timedData);
    await Promise.all([first, second]);
  });

  it('performs a new provider operation after an earlier success settles', async () => {
    let calls = 0;
    const coordinator = new CalendarReadCoordinator({
      read: async () => { calls += 1; return timedData; },
      now: () => now,
      timeZone: () => 'Europe/London',
    });
    await coordinator.get({});
    await coordinator.get({ startDate: householdToday });
    assert.equal(calls, 2);
  });

  it('removes a failed operation so a later request can retry', async () => {
    let calls = 0;
    const coordinator = new CalendarReadCoordinator({
      read: async () => {
        calls += 1;
        if (calls === 1) throw new Error('provider failed');
        return timedData;
      },
      now: () => now,
      timeZone: () => 'Europe/London',
    });
    await assert.rejects(coordinator.get({}), /provider failed/);
    assert.equal(coordinator.activeCount(), 0);
    assert.deepEqual(await coordinator.get({}), timedData);
    assert.equal(calls, 2);
  });

  it('settles both callers when their shared provider operation fails', async () => {
    const pending = deferred<TimedCalendarData>();
    let calls = 0;
    const coordinator = new CalendarReadCoordinator({
      read: async () => { calls += 1; return pending.promise; },
      now: () => now,
      timeZone: () => 'Europe/London',
    });
    const first = coordinator.get({});
    const second = coordinator.get({ startDate: householdToday });
    pending.reject(new Error('shared failure'));
    await assert.rejects(first, /shared failure/);
    await assert.rejects(second, /shared failure/);
    assert.equal(calls, 1);
    assert.equal(coordinator.activeCount(), 0);
  });
});

describe('Calendar provider timeout', () => {
  it('allows a provider response that completes before the deadline', async () => {
    setHouseholdConfigForTests(config);
    const result = await getTimedSafeCalendarData(
      { startDate: householdToday },
      {
        timeoutMs: 100,
        fetcher: async () => new Response(JSON.stringify(v2Response())),
      },
    );
    assert.deepEqual(result.data, calendarData);
    assert.ok(result.timing.providerMs >= 0);
    assert.ok(result.timing.processingMs >= 0);
  });

  it('bounds a stalled provider and does not leave the request stuck', async () => {
    setHouseholdConfigForTests(config);
    let calls = 0;
    const coordinator = new CalendarReadCoordinator({
      read: request => getTimedSafeCalendarData(request, {
        timeoutMs: 10,
        fetcher: async (_input, init) => {
          calls += 1;
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('private provider aborted')), { once: true });
          });
        },
      }),
      now: () => now,
      timeZone: () => 'Europe/London',
    });
    await assert.rejects(
      coordinator.get({ startDate: householdToday }),
      CalendarProviderTimeoutError,
    );
    assert.equal(coordinator.activeCount(), 0);
    await assert.rejects(
      coordinator.get({ startDate: householdToday }),
      CalendarProviderTimeoutError,
    );
    assert.equal(calls, 2);
  });
});

describe('Calendar API timing metadata', () => {
  let server: Server | null = null;

  afterEach(async () => {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    server = null;
  });

  async function start(readCalendar: () => Promise<TimedCalendarData>) {
    setHouseholdConfigForTests(config);
    const app = express();
    app.get('/api/calendar', (request, response) => {
      void readCalendarRoute(request, response, {
        readCalendar,
        readAssignments: async () => ({ schemaVersion: 1, assignments: [] }),
        now: () => now,
        clock: (() => {
          let value = 100;
          return () => value += 5;
        })(),
      });
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server failed.');
    return `http://127.0.0.1:${address.port}/api/calendar`;
  }

  it('returns generic provider, processing, and total Server-Timing metrics', async () => {
    const response = await fetch(await start(async () => timedData));
    assert.equal(response.status, 200);
    const timing = response.headers.get('server-timing') ?? '';
    assert.match(timing, /^provider;dur=25\.3, processing;dur=1\.5, total;dur=5\.0$/);
    for (const sensitive of ['private-provider', 'deployment', 'secret', 'calendarId', 'etag']) {
      assert.doesNotMatch(timing, new RegExp(sensitive, 'i'));
    }
  });

  it('returns a controlled failure without leaking provider details', async () => {
    const response = await fetch(await start(async () => {
      throw new Error('https://private-provider.example.test/?token=secret');
    }));
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'Calendar unavailable' });
    assert.match(response.headers.get('server-timing') ?? '', /^total;dur=5\.0$/);
    assert.doesNotMatch(JSON.stringify([...response.headers]), /private-provider|secret/i);
  });

  it('returns a controlled timed-out response with non-sensitive timing', async () => {
    const response = await fetch(await start(() => getTimedSafeCalendarData(
      { startDate: householdToday },
      {
        timeoutMs: 10,
        fetcher: async () => new Promise<Response>(() => undefined),
      },
    )));
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'Calendar unavailable' });
    const timing = response.headers.get('server-timing') ?? '';
    assert.match(timing, /^provider;dur=\d+\.\d, processing;dur=0\.0, total;dur=5\.0$/);
    assert.doesNotMatch(timing, /private-provider|deployment|secret/i);
  });
});
