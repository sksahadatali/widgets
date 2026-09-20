import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  setHouseholdConfigForTests,
  type HouseholdConfig,
} from '../../server/src/config/householdConfig.js';
import { getSafeCalendarData } from '../../server/src/services/calendarProvider.js';
import {
  CalendarWindowRequestError,
  getCalendarHouseholdToday,
  parseCalendarWindowRequest,
} from '../../server/src/services/calendarWindow.js';

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
    endpoint: 'https://calendar.example.test/private-v2?deployment=one',
    refreshMinutes: 15,
    sources: [{
      sourceId: 'family', label: 'Family', kind: 'family',
      calendarId: 'private-calendar',
    }],
    semanticRules: [],
  },
};

const futureEvent = {
  identityVersion: 1,
  provider: 'google-calendar',
  providerEventId: 'private-future-event',
  calendarId: 'private-calendar',
  recurringEventId: 'private-series',
  originalStartTime: {
    kind: 'dateTime', value: '2026-10-26T18:00:00+00:00',
    timeZone: 'Europe/London',
  },
  iCalUID: 'private-ical-uid', etag: 'private-etag',
  updated: '2026-10-20T10:00:00.000Z', status: 'confirmed',
  writable: true, calendarName: 'Private Family Calendar',
  title: 'Future lesson',
  start: {
    kind: 'dateTime', value: '2026-10-26T18:00:00+00:00',
    timeZone: 'Europe/London',
  },
  end: {
    kind: 'dateTime', value: '2026-10-26T19:00:00+00:00',
    timeZone: 'Europe/London',
  },
  allDay: false, location: '', description: '',
};

type ResponseWindow = {
  startDate: string;
  endDateExclusive: string;
  timeMin: string;
  timeMax: string;
};

const SEVEN_DAY_WINDOW: ResponseWindow = {
  startDate: '2026-10-24',
  endDateExclusive: '2026-10-31',
  timeMin: '2026-10-23T23:00:00.000Z',
  timeMax: '2026-10-31T00:00:00.000Z',
};

const FORTY_TWO_DAY_WINDOW: ResponseWindow = {
  startDate: '2026-10-01',
  endDateExclusive: '2026-11-12',
  timeMin: '2026-09-30T23:00:00.000Z',
  timeMax: '2026-11-12T00:00:00.000Z',
};

function v2Response(window: ResponseWindow, events = [futureEvent]) {
  return {
    success: true, contractVersion: 2, provider: 'google-calendar',
    generatedAt: '2026-10-20T10:00:00.000Z',
    timeZone: 'Europe/London', window,
    calendarUrl: 'https://calendar.google.test/private', events,
  };
}

afterEach(() => setHouseholdConfigForTests(null, 'demo'));

describe('Calendar requested-window boundary', () => {
  it('derives Household Today using Europe/London civil dates', () => {
    assert.equal(
      getCalendarHouseholdToday(
        new Date('2026-09-19T23:30:00.000Z'),
        'Europe/London',
      ),
      '2026-09-20',
    );
  });

  it('keeps parameter-free and start-only requests on the seven-day contract', () => {
    const now = new Date('2026-09-20T08:00:00.000Z');
    assert.deepEqual(
      parseCalendarWindowRequest({}, now, 'Europe/London'),
      {},
    );
    assert.deepEqual(
      parseCalendarWindowRequest(
        { startDate: '2026-09-27' }, now, 'Europe/London'
      ),
      { startDate: '2026-09-27' },
    );
  });

  it('accepts one canonical bounded multi-week request', () => {
    assert.deepEqual(
      parseCalendarWindowRequest(
        { startDate: '2026-10-01', days: '42' },
        new Date('2026-09-20T08:00:00.000Z'),
        'Europe/London',
      ),
      { startDate: '2026-10-01', days: 42 },
    );
  });

  it('rejects history, malformed/repeated dates, invalid days, and unknown fields', () => {
    const now = new Date('2026-09-20T08:00:00.000Z');
    const invalidQueries: Array<Record<string, unknown>> = [
      { startDate: '2026-09-19' },
      { startDate: '2026-02-30' },
      { startDate: '2026-9-27' },
      { startDate: ['2026-09-27', '2026-10-04'] },
      { days: '35' },
      { startDate: '2026-09-27', days: ['7', '14'] },
      { startDate: '2026-09-27', days: '0' },
      { startDate: '2026-09-27', days: '-1' },
      { startDate: '2026-09-27', days: '1.5' },
      { startDate: '2026-09-27', days: '07' },
      { startDate: '2026-09-27', days: '43' },
      { startDate: '2026-09-27', days: '7', extra: 'unsafe' },
    ];
    for (const query of invalidQueries) {
      assert.throws(
        () => parseCalendarWindowRequest(query, now, 'Europe/London'),
        CalendarWindowRequestError,
      );
    }
  });

  it('forwards one bounded request and accepts its exact DST-spanning interval', async () => {
    setHouseholdConfigForTests(config);
    let requestedUrl = '';
    const result = await getSafeCalendarData(
      { startDate: '2026-10-01', days: 42 },
      async input => {
        requestedUrl = String(input);
        return new Response(JSON.stringify(v2Response(FORTY_TWO_DAY_WINDOW)));
      },
    );

    const url = new URL(requestedUrl);
    assert.equal(url.searchParams.get('deployment'), 'one');
    assert.equal(url.searchParams.get('startDate'), '2026-10-01');
    assert.equal(url.searchParams.get('days'), '42');
    assert.equal(result.events[0].startLocalDate, '2026-10-26');
    assert.equal(result.events[0].endLocalDateExclusive, '2026-10-27');
    assert.match(result.events[0].eventKey, /^calendar-event-v1-[a-f0-9]{64}$/);
  });

  it('keeps event identity stable across valid seven and multi-week windows', async () => {
    setHouseholdConfigForTests(config);
    const fetcher = (window: ResponseWindow) => async () =>
      new Response(JSON.stringify(v2Response(window)));
    const seven = await getSafeCalendarData(
      { startDate: '2026-10-24' }, fetcher(SEVEN_DAY_WINDOW)
    );
    const month = await getSafeCalendarData(
      { startDate: '2026-10-01', days: 42 },
      fetcher(FORTY_TWO_DAY_WINDOW),
    );
    assert.equal(seven.events[0].eventKey, month.events[0].eventKey);
  });

  it('fails closed when the producer interval differs from the request', async () => {
    setHouseholdConfigForTests(config);
    await assert.rejects(
      getSafeCalendarData(
        { startDate: '2026-10-01', days: 42 },
        async () => new Response(JSON.stringify(v2Response(SEVEN_DAY_WINDOW))),
      ),
      /window is invalid/,
    );
  });

  it('retains v1 only for the existing parameter-free request', async () => {
    setHouseholdConfigForTests(config);
    const legacy = {
      success: true,
      events: [{
        id: 'legacy', title: 'Legacy', start: '2026-10-24',
        end: '2026-10-25', allDay: true,
      }],
    };
    const fetcher = async () => new Response(JSON.stringify(legacy));
    assert.equal((await getSafeCalendarData({}, fetcher)).events.length, 1);
    await assert.rejects(
      getSafeCalendarData({ startDate: '2026-10-24' }, fetcher),
      /does not support requested windows/,
    );
    await assert.rejects(
      getSafeCalendarData(
        { startDate: '2026-10-24', days: 35 }, fetcher
      ),
      /does not support requested windows/,
    );
  });
});
