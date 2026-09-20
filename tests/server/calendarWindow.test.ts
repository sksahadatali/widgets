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
  parseCalendarWindowStart,
} from '../../server/src/services/calendarWindow.js';

const config: HouseholdConfig = {
  schemaVersion: 1,
  household: {
    displayName: 'Test Household',
    members: [{ id: 'child', displayName: 'Child', memberType: 'child' }],
  },
  location: {
    name: 'Test Town',
    latitude: 51,
    longitude: -1,
    timezone: 'Europe/London',
  },
  travel: {
    homeAddress: 'Private address',
    leaveBufferMinutes: 10,
    destinations: [],
  },
  calendar: {
    endpoint: 'https://calendar.example.test/private-v2?deployment=one',
    refreshMinutes: 15,
    sources: [{
      sourceId: 'family',
      label: 'Family',
      kind: 'family',
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
    kind: 'dateTime',
    value: '2026-10-26T18:00:00+00:00',
    timeZone: 'Europe/London',
  },
  iCalUID: 'private-ical-uid',
  etag: 'private-etag',
  updated: '2026-10-20T10:00:00.000Z',
  status: 'confirmed',
  writable: true,
  calendarName: 'Private Family Calendar',
  title: 'Future lesson',
  start: {
    kind: 'dateTime',
    value: '2026-10-26T18:00:00+00:00',
    timeZone: 'Europe/London',
  },
  end: {
    kind: 'dateTime',
    value: '2026-10-26T19:00:00+00:00',
    timeZone: 'Europe/London',
  },
  allDay: false,
  location: '',
  description: '',
};

function v2Response(startDate = '2026-10-24') {
  return {
    success: true,
    contractVersion: 2,
    provider: 'google-calendar',
    generatedAt: '2026-10-20T10:00:00.000Z',
    timeZone: 'Europe/London',
    window: {
      startDate,
      endDateExclusive: '2026-10-31',
      timeMin: '2026-10-23T23:00:00.000Z',
      timeMax: '2026-10-31T00:00:00.000Z',
    },
    calendarUrl: 'https://calendar.google.test/private',
    events: [futureEvent],
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

  it('keeps the default request compatible and accepts current or future starts', () => {
    const now = new Date('2026-09-20T08:00:00.000Z');
    assert.equal(parseCalendarWindowStart({}, now, 'Europe/London'), undefined);
    assert.equal(
      parseCalendarWindowStart({ startDate: '2026-09-20' }, now, 'Europe/London'),
      '2026-09-20',
    );
    assert.equal(
      parseCalendarWindowStart({ startDate: '2026-09-27' }, now, 'Europe/London'),
      '2026-09-27',
    );
  });

  it('rejects history, malformed dates, repeated values, and unknown fields', () => {
    const now = new Date('2026-09-20T08:00:00.000Z');
    for (const query of [
      { startDate: '2026-09-19' },
      { startDate: '2026-02-30' },
      { startDate: '2026-9-27' },
      { startDate: ['2026-09-27', '2026-10-04'] },
      { startDate: '2026-09-27', days: '14' },
    ]) {
      assert.throws(
        () => parseCalendarWindowStart(query, now, 'Europe/London'),
        CalendarWindowRequestError,
      );
    }
  });

  it('passes the requested start to Apps Script and accepts a DST-safe seven-civil-day response', async () => {
    setHouseholdConfigForTests(config);
    let requestedUrl = '';
    const result = await getSafeCalendarData('2026-10-24', async input => {
      requestedUrl = String(input);
      return new Response(JSON.stringify(v2Response()));
    });

    const url = new URL(requestedUrl);
    assert.equal(url.origin + url.pathname, 'https://calendar.example.test/private-v2');
    assert.equal(url.searchParams.get('deployment'), 'one');
    assert.equal(url.searchParams.get('startDate'), '2026-10-24');
    assert.equal(result.events[0].startLocalDate, '2026-10-26');
    assert.equal(result.events[0].endLocalDateExclusive, '2026-10-27');
    assert.match(result.events[0].eventKey, /^calendar-event-v1-[a-f0-9]{64}$/);
  });

  it('fails closed when Apps Script ignores or misstates the requested window', async () => {
    setHouseholdConfigForTests(config);
    await assert.rejects(
      getSafeCalendarData('2026-10-24', async () =>
        new Response(JSON.stringify(v2Response('2026-10-17')))),
      /window is invalid/,
    );
  });

  it('retains v1 only for the existing default request', async () => {
    setHouseholdConfigForTests(config);
    const legacy = {
      success: true,
      events: [{
        id: 'legacy',
        title: 'Legacy',
        start: '2026-10-24',
        end: '2026-10-25',
        allDay: true,
      }],
    };
    const fetcher = async () => new Response(JSON.stringify(legacy));

    assert.equal((await getSafeCalendarData(undefined, fetcher)).events.length, 1);
    await assert.rejects(
      getSafeCalendarData('2026-10-24', fetcher),
      /does not support requested windows/,
    );
  });
});
