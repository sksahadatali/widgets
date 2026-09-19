import assert from 'node:assert/strict';
import {
  describe,
  it,
} from 'node:test';

import type {
  CalendarEvent,
} from '../../app/src/calendar/calendarModel.ts';
import {
  selectRollingCalendarWeek,
} from '../../app/src/calendar/calendarWeek.ts';

const TIME_ZONE = 'Europe/London';

function event(
  id: string,
  startLocalDate: string,
  endLocalDateExclusive: string,
  options: {
    allDay?: boolean;
    start?: string;
    end?: string;
  } = {}
): CalendarEvent {
  return {
    id,
    eventKey: `calendar-event-v1-${id.padEnd(64, 'a').slice(0, 64)}`,
    title: id,
    start: options.start ?? startLocalDate,
    end: options.end ?? endLocalDateExclusive,
    startLocalDate,
    endLocalDateExclusive,
    allDay: options.allDay ?? true,
    location: '',
    description: '',
    calendarUrl: '',
    source: { id: 'family', label: 'Family', kind: 'family' },
    profileAssignment: {
      target: { kind: 'family' },
      basis: 'explicit',
    },
  };
}

describe('rolling Weekly Family Calendar', () => {
  it('always produces Household Today through Today plus six days', () => {
    const days = selectRollingCalendarWeek(
      [],
      new Date('2026-09-19T12:00:00.000Z'),
      TIME_ZONE
    );

    assert.deepEqual(
      days.map(day => day.localDate),
      [
        '2026-09-19',
        '2026-09-20',
        '2026-09-21',
        '2026-09-22',
        '2026-09-23',
        '2026-09-24',
        '2026-09-25',
      ]
    );
    assert.deepEqual(days.map(day => day.isToday), [
      true, false, false, false, false, false, false,
    ]);
  });

  it('uses the Household-local date near UTC midnight', () => {
    const days = selectRollingCalendarWeek(
      [],
      new Date('2026-09-18T23:30:00.000Z'),
      TIME_ZONE
    );

    assert.equal(days[0].localDate, '2026-09-19');
  });

  it('excludes past and day-eight events', () => {
    const days = selectRollingCalendarWeek(
      [
        event('past', '2026-09-18', '2026-09-19'),
        event('ended-today', '2026-09-19', '2026-09-20', {
          allDay: false,
          start: '2026-09-19T07:00:00.000Z',
          end: '2026-09-19T08:00:00.000Z',
        }),
        event('today', '2026-09-19', '2026-09-20'),
        event('day-eight', '2026-09-26', '2026-09-27'),
      ],
      new Date('2026-09-19T12:00:00.000Z'),
      TIME_ZONE
    );

    assert.deepEqual(
      days.flatMap(day => day.events.map(item => item.id)),
      ['today']
    );
  });

  it('places a timed event on its structured local date', () => {
    const days = selectRollingCalendarWeek(
      [event('timed', '2026-09-22', '2026-09-23', {
        allDay: false,
        start: '2026-09-22T17:30:00.000Z',
      })],
      new Date('2026-09-19T12:00:00.000Z'),
      TIME_ZONE
    );

    assert.deepEqual(days[3].events.map(item => item.id), ['timed']);
  });

  it('places a multi-day all-day event on every overlapping displayed day', () => {
    const days = selectRollingCalendarWeek(
      [event('holiday', '2026-09-18', '2026-09-22')],
      new Date('2026-09-19T12:00:00.000Z'),
      TIME_ZONE
    );

    assert.deepEqual(
      days.map(day => day.events.map(item => item.id)),
      [['holiday'], ['holiday'], ['holiday'], [], [], [], []]
    );
  });

  it('sorts all-day events before timed events without changing assignments', () => {
    const assigned = event('assigned', '2026-09-19', '2026-09-20', {
      allDay: false,
      start: '2026-09-19T08:00:00.000Z',
    });
    assigned.profileAssignment = {
      target: { kind: 'members', profileIds: ['child'] },
      basis: 'source-default',
    };
    const days = selectRollingCalendarWeek(
      [assigned, event('all-day', '2026-09-19', '2026-09-20')],
      new Date('2026-09-19T06:00:00.000Z'),
      TIME_ZONE
    );

    assert.deepEqual(
      days[0].events.map(item => item.id),
      ['all-day', 'assigned']
    );
    assert.deepEqual(
      days[0].events[1].profileAssignment,
      assigned.profileAssignment
    );
  });
});
