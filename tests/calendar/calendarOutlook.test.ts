import assert from 'node:assert/strict';
import {
  describe,
  it,
} from 'node:test';

import {
  HOME_CALENDAR_EVENT_LIMIT,
  selectCalendarOutlook,
} from '../../app/src/calendar/calendarOutlook.ts';
import type {
  CalendarEvent,
} from '../../app/src/calendar/calendarModel.ts';

const TIME_ZONE = 'Europe/London';

function event(
  id: string,
  startLocalDate: string,
  endLocalDateExclusive: string,
  options: {
    allDay?: boolean;
    start?: string;
  } = {}
): CalendarEvent {
  const allDay = options.allDay ?? true;
  const start = options.start ?? startLocalDate;

  return {
    id,
    title: id,
    start,
    end: endLocalDateExclusive,
    startLocalDate,
    endLocalDateExclusive,
    allDay,
    location: '',
    description: '',
    calendarUrl: 'https://example.invalid/calendar',
    source: {
      id: 'calendar-example',
      label: 'Calendar',
      kind: 'calendar',
    },
  };
}

function ids(events: CalendarEvent[]) {
  return events.map(item => item.id);
}

describe('rolling Calendar outlook', () => {
  it('groups an event overlapping Today', () => {
    const result = selectCalendarOutlook(
      [event('today', '2026-08-30', '2026-08-31')],
      new Date('2026-08-30T10:00:00.000Z'),
      TIME_ZONE
    );

    assert.deepEqual(ids(result.todayEvents), ['today']);
  });

  it('groups an event overlapping Tomorrow', () => {
    const result = selectCalendarOutlook(
      [event('tomorrow', '2026-08-31', '2026-09-01')],
      new Date('2026-08-30T10:00:00.000Z'),
      TIME_ZONE
    );

    assert.deepEqual(ids(result.tomorrowEvents), ['tomorrow']);
  });

  it('groups all later returned events under Coming Up', () => {
    const result = selectCalendarOutlook(
      [event('later', '2026-09-05', '2026-09-06')],
      new Date('2026-08-30T10:00:00.000Z'),
      TIME_ZONE
    );

    assert.deepEqual(ids(result.comingUpEvents), ['later']);
  });

  it('rolls from Sunday through Monday into Tuesday without a week boundary', () => {
    const result = selectCalendarOutlook(
      [
        event('monday', '2026-08-31', '2026-09-01'),
        event('tuesday', '2026-09-01', '2026-09-02'),
      ],
      new Date('2026-08-30T10:00:00.000Z'),
      TIME_ZONE
    );

    assert.deepEqual(ids(result.tomorrowEvents), ['monday']);
    assert.deepEqual(ids(result.comingUpEvents), ['tuesday']);
  });

  it('rolls across a month boundary', () => {
    const result = selectCalendarOutlook(
      [
        event('month-tomorrow', '2026-09-01', '2026-09-02'),
        event('month-later', '2026-09-02', '2026-09-03'),
      ],
      new Date('2026-08-31T10:00:00.000Z'),
      TIME_ZONE
    );

    assert.deepEqual(ids(result.tomorrowEvents), ['month-tomorrow']);
    assert.deepEqual(ids(result.comingUpEvents), ['month-later']);
  });

  it('rolls across a year boundary', () => {
    const result = selectCalendarOutlook(
      [
        event('new-year', '2027-01-01', '2027-01-02'),
        event('january-second', '2027-01-02', '2027-01-03'),
      ],
      new Date('2026-12-31T10:00:00.000Z'),
      TIME_ZONE
    );

    assert.deepEqual(ids(result.tomorrowEvents), ['new-year']);
    assert.deepEqual(ids(result.comingUpEvents), ['january-second']);
  });

  it('sorts timed events deterministically within a civil date', () => {
    const result = selectCalendarOutlook(
      [
        event('late', '2026-08-30', '2026-08-31', {
          allDay: false,
          start: '2026-08-30T18:00:00.000Z',
        }),
        event('early', '2026-08-30', '2026-08-31', {
          allDay: false,
          start: '2026-08-30T08:00:00.000Z',
        }),
      ],
      new Date('2026-08-30T06:00:00.000Z'),
      TIME_ZONE
    );

    assert.deepEqual(ids(result.todayEvents), ['early', 'late']);
  });

  it('keeps an ongoing multi-day all-day event relevant Today', () => {
    const result = selectCalendarOutlook(
      [event('holiday', '2026-08-24', '2026-08-31')],
      new Date('2026-08-30T10:00:00.000Z'),
      TIME_ZONE
    );

    assert.deepEqual(ids(result.todayEvents), ['holiday']);
    assert.deepEqual(ids(result.tomorrowEvents), []);
  });

  it('does not include the exclusive all-day end date', () => {
    const result = selectCalendarOutlook(
      [event('ended-holiday', '2026-08-24', '2026-08-30')],
      new Date('2026-08-30T10:00:00.000Z'),
      TIME_ZONE
    );

    assert.deepEqual(result, {
      todayEvents: [],
      tomorrowEvents: [],
      comingUpEvents: [],
    });
  });

  it('uses the household civil date near a UTC midnight', () => {
    const result = selectCalendarOutlook(
      [event('local-monday', '2026-08-31', '2026-09-01')],
      new Date('2026-08-30T23:30:00.000Z'),
      TIME_ZONE
    );

    assert.deepEqual(ids(result.todayEvents), ['local-monday']);
  });

  it('caps the whole Home agenda deterministically', () => {
    const events = Array.from(
      { length: HOME_CALENDAR_EVENT_LIMIT + 3 },
      (_, index) => event(
        `event-${String(index).padStart(2, '0')}`,
        '2026-08-30',
        '2026-08-31'
      )
    );
    const result = selectCalendarOutlook(
      events,
      new Date('2026-08-30T10:00:00.000Z'),
      TIME_ZONE
    );

    assert.equal(result.todayEvents.length, HOME_CALENDAR_EVENT_LIMIT);
    assert.deepEqual(
      ids(result.todayEvents),
      events.slice(0, HOME_CALENDAR_EVENT_LIMIT).map(item => item.id)
    );
  });
});
