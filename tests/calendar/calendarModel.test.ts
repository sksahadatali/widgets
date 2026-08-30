import assert from 'node:assert/strict';
import {
  describe,
  it,
} from 'node:test';

import {
  classifyCalendarSource,
  createCalendarEventIdentity,
  normalizeCalendarEvent,
  type CalendarApiEvent,
  type CalendarSourceConfig,
} from '../../app/src/calendar/calendarModel.ts';

const TIME_ZONE = 'Europe/London';
const CALENDAR_URL = 'https://example.invalid/calendar';

const SOURCES: CalendarSourceConfig[] = [
  {
    sourceId: 'school',
    label: 'School',
    kind: 'school',
    calendarName: 'Academic Dates',
  },
  {
    sourceId: 'school',
    label: 'School',
    kind: 'school',
    calendarName: 'Live Diary',
  },
];

function normalize(
  event: CalendarApiEvent,
  sources = SOURCES
) {
  const normalized = normalizeCalendarEvent(
    event,
    TIME_ZONE,
    sources,
    CALENDAR_URL
  );

  assert.ok(normalized);

  return normalized;
}

describe('Calendar event normalization', () => {
  it('normalizes a timed event to household-local civil dates', () => {
    const event = normalize({
      id: 'timed-1',
      title: 'Evening event',
      start: '2026-08-30T17:30:00.000Z',
      end: '2026-08-30T18:30:00.000Z',
      allDay: false,
      calendarName: 'Family',
    });

    assert.equal(event.startLocalDate, '2026-08-30');
    assert.equal(event.endLocalDateExclusive, '2026-08-31');
    assert.equal(event.allDay, false);
  });

  it('normalizes a single-day all-day event using its exclusive end', () => {
    const event = normalize({
      id: 'all-day-1',
      title: 'Training Day',
      start: '2026-09-01',
      end: '2026-09-02',
      allDay: true,
      calendarName: 'Academic Dates',
    });

    assert.equal(event.startLocalDate, '2026-09-01');
    assert.equal(event.endLocalDateExclusive, '2026-09-02');
  });

  it('preserves a multi-day all-day event exclusive end date', () => {
    const event = normalize({
      id: 'holiday-1',
      title: 'Autumn break',
      start: '2026-10-26',
      end: '2026-10-31',
      allDay: true,
      calendarName: 'Academic Dates',
    });

    assert.equal(event.startLocalDate, '2026-10-26');
    assert.equal(event.endLocalDateExclusive, '2026-10-31');
  });

  it('uses the household timezone instead of the runtime UTC date', () => {
    const event = normalize({
      id: 'timezone-1',
      title: 'Late event',
      start: '2026-08-30T23:30:00.000Z',
      end: '2026-08-31T00:15:00.000Z',
      allDay: false,
      calendarName: 'Family',
    });

    assert.equal(event.startLocalDate, '2026-08-31');
    assert.equal(event.endLocalDateExclusive, '2026-09-01');
  });

  it('preserves only safe configured source metadata', () => {
    const event = normalize({
      id: 'source-1',
      title: 'School reopens',
      start: '2026-09-03',
      end: '2026-09-04',
      allDay: true,
      calendarId: 'private-provider-calendar-id',
      calendarName: 'Academic Dates',
    });

    assert.deepEqual(event.source, {
      id: 'school',
      label: 'School',
      kind: 'school',
    });
    assert.equal('calendarId' in event, false);
    assert.equal('calendarName' in event, false);
    assert.equal(event.id.includes('private-provider-calendar-id'), false);
  });

  it('maps multiple provider calendars to one generic safe source', () => {
    assert.deepEqual(
      classifyCalendarSource('', 'Live Diary', SOURCES),
      {
        id: 'school',
        label: 'School',
        kind: 'school',
      }
    );
  });

  it('uses a non-identifying fallback for an unknown source', () => {
    const source = classifyCalendarSource(
      'private-unknown-id',
      'Private Calendar Name',
      SOURCES
    );

    assert.equal(source.label, 'Calendar');
    assert.equal(source.kind, 'calendar');
    assert.equal(source.id.includes('private-unknown-id'), false);
    assert.equal(source.id.includes('Private Calendar Name'), false);
  });

  it('creates collision-safe identity across provider calendars', () => {
    const first = createCalendarEventIdentity(
      'provider-event-id',
      'provider-calendar-a',
      ''
    );
    const second = createCalendarEventIdentity(
      'provider-event-id',
      'provider-calendar-b',
      ''
    );

    assert.notEqual(first, second);
    assert.equal(
      first,
      createCalendarEventIdentity(
        'provider-event-id',
        'provider-calendar-a',
        ''
      )
    );
    assert.equal(first.includes('provider-event-id'), false);
    assert.equal(first.includes('provider-calendar-a'), false);
  });
});
