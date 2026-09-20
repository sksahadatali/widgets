import assert from 'node:assert/strict';
import {
  describe,
  it,
} from 'node:test';

import type {
  CalendarEvent,
} from '../../app/src/calendar/calendarModel.ts';
import {
  canNavigateCalendarWindowPrevious,
  createCalendarWindowState,
  formatCalendarWindowRange,
  navigateCalendarWindow,
  resetCalendarWindowToToday,
  selectCalendarWindow,
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

  it('moves forward and back in seven Household-local civil days', () => {
    const today = createCalendarWindowState(
      new Date('2026-09-19T12:00:00.000Z'),
      TIME_ZONE
    );
    const next = navigateCalendarWindow(today, 7);
    const returned = navigateCalendarWindow(next, -7);

    assert.equal(next.startLocalDate, '2026-09-26');
    assert.equal(returned.startLocalDate, '2026-09-19');
    assert.equal(canNavigateCalendarWindowPrevious(next), true);
  });

  it('refuses navigation before Household Today and resets to Today', () => {
    const today = createCalendarWindowState(
      new Date('2026-09-19T12:00:00.000Z'),
      TIME_ZONE
    );

    assert.equal(canNavigateCalendarWindowPrevious(today), false);
    assert.deepEqual(navigateCalendarWindow(today, -7), today);
    assert.deepEqual(
      resetCalendarWindowToToday(navigateCalendarWindow(today, 7)),
      today
    );
  });

  it('formats the selected rolling range and crosses years safely', () => {
    assert.equal(
      formatCalendarWindowRange('2026-09-20'),
      '20 Sept – 26 Sept 2026'
    );
    assert.equal(
      formatCalendarWindowRange('2026-12-29'),
      '29 Dec 2026 – 4 Jan 2027'
    );
  });

  it('moves by civil dates across Europe/London DST changes', () => {
    const state = {
      householdToday: '2026-10-24',
      startLocalDate: '2026-10-24',
    };

    assert.equal(
      navigateCalendarWindow(state, 7).startLocalDate,
      '2026-10-31'
    );
  });

  it('excludes past and day-eight events', () => {
    const days = selectRollingCalendarWeek(
      [
        event('past', '2026-09-18', '2026-09-19'),
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

  it('keeps an earlier timed event visible for the whole Household-local Today', () => {
    const days = selectRollingCalendarWeek(
      [event('ended-today', '2026-09-19', '2026-09-20', {
        allDay: false,
        start: '2026-09-19T07:00:00.000Z',
        end: '2026-09-19T08:00:00.000Z',
      })],
      new Date('2026-09-19T12:00:00.000Z'),
      TIME_ZONE
    );

    assert.deepEqual(
      days[0].events.map(item => item.id),
      ['ended-today']
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

  it('places only events inside a selected future seven-day window', () => {
    const days = selectCalendarWindow(
      [
        event('before-window', '2026-09-25', '2026-09-26'),
        event('inside-window', '2026-09-26', '2026-09-27'),
        event('after-window', '2026-10-03', '2026-10-04'),
      ],
      '2026-09-26',
      '2026-09-19'
    );

    assert.deepEqual(
      days.flatMap(day => day.events.map(item => item.id)),
      ['inside-window']
    );
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
