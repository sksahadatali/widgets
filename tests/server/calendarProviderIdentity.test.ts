import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { setHouseholdConfigForTests, type HouseholdConfig } from '../../server/src/config/householdConfig.js';
import { getSafeCalendarData } from '../../server/src/services/calendarProvider.js';

const config: HouseholdConfig = {
  schemaVersion: 1,
  household: { displayName: 'Test Household', members: [{ id: 'adult', displayName: 'Adult', memberType: 'adult' }] },
  location: { name: 'Test Town', latitude: 51, longitude: -1, timezone: 'Europe/London' },
  travel: { homeAddress: 'Private address', leaveBufferMinutes: 10, destinations: [] },
  calendar: {
    endpoint: 'https://calendar.example.test/private-v2',
    refreshMinutes: 15,
    sources: [{ sourceId: 'family', label: 'Family', kind: 'family', calendarId: 'private-calendar-a', writeAccess: 'edit-existing' }],
    semanticRules: [],
  },
};

const ordinary = {
  identityVersion: 1,
  provider: 'google-calendar',
  providerEventId: 'private-event-ordinary',
  calendarId: 'private-calendar-a',
  recurringEventId: null,
  originalStartTime: null,
  iCalUID: 'private-ical-uid',
  etag: 'private-etag',
  updated: '2026-09-19T09:00:00.000Z',
  status: 'confirmed',
  writable: true,
  calendarName: 'Private Family Calendar',
  title: 'Appointment',
  start: { kind: 'dateTime', value: '2026-09-20T09:00:00+01:00', timeZone: 'Europe/London' },
  end: { kind: 'dateTime', value: '2026-09-20T10:00:00+01:00', timeZone: 'Europe/London' },
  allDay: false,
  location: 'Location',
  description: 'Private description',
} as const;

function response(events: readonly unknown[]) {
  return {
    success: true,
    contractVersion: 2,
    provider: 'google-calendar',
    generatedAt: '2026-09-19T10:00:00.000Z',
    timeZone: 'Europe/London',
    window: {
      startDate: '2026-09-19',
      endDateExclusive: '2026-09-26',
      timeMin: '2026-09-18T23:00:00.000Z',
      timeMax: '2026-09-25T23:00:00.000Z',
    },
    calendarUrl: 'https://calendar.google.test/private',
    events,
  };
}

async function normalize(events: readonly unknown[]) {
  setHouseholdConfigForTests(config);
  return getSafeCalendarData({}, async () => new Response(JSON.stringify(response(events))));
}

afterEach(() => setHouseholdConfigForTests(null, 'demo'));

describe('Calendar API v2 identity foundation', () => {
  it('keeps an ordinary identity deterministic across repeated refreshes', async () => {
    const first = (await normalize([ordinary])).events[0];
    const second = (await normalize([ordinary])).events[0];
    assert.equal(first.eventKey, second.eventKey);
    assert.equal(first.id, first.eventKey);
    assert.match(first.eventKey, /^calendar-event-v1-[a-f0-9]{64}$/);
  });

  it('keeps an ordinary identity stable when its current time changes', async () => {
    const first = (await normalize([ordinary])).events[0];
    const moved = {
      ...ordinary,
      start: { ...ordinary.start, value: '2026-09-21T14:00:00+01:00' },
      end: { ...ordinary.end, value: '2026-09-21T15:00:00+01:00' },
      etag: 'changed-private-etag',
      updated: '2026-09-20T11:00:00.000Z',
    };
    const second = (await normalize([moved])).events[0];
    assert.equal(first.eventKey, second.eventKey);
  });

  it('keeps an ordinary identity stable across title, location, and description edits', async () => {
    const first = (await normalize([ordinary])).events[0];
    const changed = {
      ...ordinary,
      title: 'Renamed appointment',
      location: 'Changed location',
      description: 'Changed private description',
    };
    const second = (await normalize([changed])).events[0];
    assert.equal(first.eventKey, second.eventKey);
  });

  it('namespaces equal ordinary provider IDs by stable calendar ID', async () => {
    const events = (await normalize([ordinary, { ...ordinary, calendarId: 'private-calendar-b' }])).events;
    assert.notEqual(events[0].eventKey, events[1].eventKey);
  });

  it('keeps a moved recurring occurrence stable and distinguishes siblings', async () => {
    const recurring = {
      ...ordinary,
      providerEventId: 'private-occurrence-1',
      recurringEventId: 'private-series',
      originalStartTime: { kind: 'dateTime', value: '2026-09-19T08:30:00+01:00', timeZone: 'Europe/London' },
    };
    const moved = {
      ...recurring,
      start: { ...ordinary.start, value: '2026-09-19T10:30:00+01:00' },
      end: { ...ordinary.end, value: '2026-09-19T11:30:00+01:00' },
    };
    const sibling = {
      ...recurring,
      providerEventId: 'private-occurrence-2',
      originalStartTime: { ...recurring.originalStartTime, value: '2026-09-26T08:30:00+01:00' },
    };
    const events = (await normalize([recurring, moved, sibling])).events;
    const refreshed = (await normalize([recurring])).events[0];
    assert.equal(events[0].eventKey, refreshed.eventKey);
    assert.equal(events[0].eventKey, events[1].eventKey);
    assert.notEqual(events[0].eventKey, events[2].eventKey);
  });

  it('rejects recurring occurrences without immutable original start identity', async () => {
    await assert.rejects(
      normalize([{ ...ordinary, recurringEventId: 'private-series', originalStartTime: null }]),
      /recurring occurrence identity is incomplete/,
    );
  });

  it('handles all-day ordinary events without making civil dates part of identity', async () => {
    const allDay = {
      ...ordinary,
      start: { kind: 'date', value: '2026-09-20' },
      end: { kind: 'date', value: '2026-09-21' },
      allDay: true,
    };
    const moved = {
      ...allDay,
      start: { kind: 'date', value: '2026-09-22' },
      end: { kind: 'date', value: '2026-09-23' },
    };
    const first = (await normalize([allDay])).events[0];
    const second = (await normalize([moved])).events[0];
    assert.equal(first.eventKey, second.eventKey);
    assert.equal(first.startLocalDate, '2026-09-20');
    assert.equal(first.endLocalDateExclusive, '2026-09-21');
  });

  it('keeps provider locators and descriptions out of the browser contract', async () => {
    const event = (await normalize([ordinary])).events[0];
    assert.equal(event.description, '');
    assert.equal(event.writable, true);
    assert.equal(event.status, 'confirmed');
    const serialized = JSON.stringify(event);
    for (const forbidden of ['private-event-ordinary', 'private-calendar-a', 'private-ical-uid', 'private-etag', 'Private Family Calendar', 'Private description']) {
      assert.doesNotMatch(serialized, new RegExp(forbidden));
    }
    for (const rawField of ['providerEventId', 'recurringEventId', 'calendarId', 'iCalUID', 'etag', 'originalStartTime']) {
      assert.equal(rawField in event, false);
    }
  });

  it('propagates read-only capability through the safe contract', async () => {
    const event = (await normalize([{ ...ordinary, writable: false }])).events[0];
    assert.equal(event.writable, false);
  });

  it('retains explicit v1 compatibility and its existing opaque identity', async () => {
    setHouseholdConfigForTests(config);
    const v1 = {
      success: true,
      generatedAt: '2026-09-19T10:00:00.000Z',
      timeZone: 'Europe/London',
      events: [{ id: 'legacy-event', title: 'Legacy', start: '2026-09-20', end: '2026-09-21', allDay: true, calendarId: 'private-calendar-a', calendarName: 'Private Family Calendar' }],
    };
    const result = await getSafeCalendarData({}, async () => new Response(JSON.stringify(v1)));
    assert.match(result.events[0].eventKey, /^calendar-[a-f0-9]{16}-[a-f0-9]{16}$/);
    assert.equal(result.events[0].id, result.events[0].eventKey);
  });

  it('rejects malformed v2 identity and temporal contracts', async () => {
    await assert.rejects(normalize([{ ...ordinary, calendarId: '' }]), /v2 event is invalid/);
    await assert.rejects(normalize([{ ...ordinary, start: { kind: 'dateTime', value: 'not-a-date' } }]), /date-time is invalid/);
    await assert.rejects(normalize([{ ...ordinary, allDay: true }]), /all-day semantics are invalid/);
  });
});
