import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canNavigateCalendarMonthPrevious,
  createCalendarMonthState,
  formatCalendarMonthLabel,
  navigateCalendarMonth,
  resetCalendarMonthToToday,
  selectCalendarMonthGrid,
} from '../../app/src/calendar/calendarMonth.ts';
import type { CalendarEvent } from '../../app/src/calendar/calendarModel.ts';

function event(
  id: string,
  startLocalDate: string,
  endLocalDateExclusive: string,
  allDay = true,
): CalendarEvent {
  return {
    id,
    eventKey: `calendar-event-v1-${id.padEnd(64, 'a').slice(0, 64)}`,
    title: id,
    start: allDay ? startLocalDate : `${startLocalDate}T09:30:00+01:00`,
    end: allDay ? endLocalDateExclusive : `${startLocalDate}T10:30:00+01:00`,
    startLocalDate,
    endLocalDateExclusive,
    allDay,
    location: '',
    description: '',
    calendarUrl: '',
    source: { id: 'family', label: 'Family', kind: 'family' },
    profileAssignment: {
      target: { kind: 'members', profileIds: ['child'] },
      basis: 'explicit',
    },
  };
}

describe('Calendar Month View model', () => {
  it('generates conventional Sunday-to-Saturday 4, 5, and 6 week grids', () => {
    const four = selectCalendarMonthGrid([], '2026-02-01', '2026-01-01');
    const five = selectCalendarMonthGrid([], '2026-11-01', '2026-10-01');
    const six = selectCalendarMonthGrid([], '2026-08-01', '2026-07-01');

    assert.deepEqual(
      [four.weekCount, four.gridStart, four.gridEndExclusive],
      [4, '2026-02-01', '2026-03-01'],
    );
    assert.deepEqual(
      [five.weekCount, five.gridStart, five.gridEndExclusive],
      [5, '2026-11-01', '2026-12-06'],
    );
    assert.deepEqual(
      [six.weekCount, six.gridStart, six.gridEndExclusive],
      [6, '2026-07-26', '2026-09-06'],
    );
  });

  it('clips the current month request to Household Today without collapsing the grid', () => {
    const grid = selectCalendarMonthGrid(
      [event('historical', '2026-09-10', '2026-09-11')],
      '2026-09-01',
      '2026-09-20',
    );

    assert.equal(grid.gridStart, '2026-08-30');
    assert.equal(grid.gridEndExclusive, '2026-10-04');
    assert.equal(grid.requestStart, '2026-09-20');
    assert.equal(grid.requestDays, 14);
    assert.equal(grid.days.length, 35);
    assert.equal(
      grid.days.find(day => day.localDate === '2026-09-10')?.events.length,
      0,
    );
  });

  it('requests a complete future visible grid in one bounded interval', () => {
    const grid = selectCalendarMonthGrid([], '2026-10-01', '2026-09-20');
    assert.equal(grid.requestStart, '2026-09-27');
    assert.equal(grid.requestDays, 35);
    assert.ok(grid.requestDays <= 42);
  });

  it('navigates by civil months, resets Today, and blocks historical months', () => {
    const today = createCalendarMonthState(
      new Date('2026-09-20T08:00:00.000Z'),
      'Europe/London',
    );
    const next = navigateCalendarMonth(today, 1);
    const previous = navigateCalendarMonth(next, -1);

    assert.equal(today.selectedMonthStart, '2026-09-01');
    assert.equal(canNavigateCalendarMonthPrevious(today), false);
    assert.deepEqual(navigateCalendarMonth(today, -1), today);
    assert.equal(next.selectedMonthStart, '2026-10-01');
    assert.equal(canNavigateCalendarMonthPrevious(next), true);
    assert.equal(previous.selectedMonthStart, '2026-09-01');
    assert.deepEqual(resetCalendarMonthToToday(next), today);
    assert.equal(formatCalendarMonthLabel(next.selectedMonthStart), 'October 2026');
  });

  it('places timed, all-day, and multi-day events without changing assignments', () => {
    const timed = event('timed', '2026-10-04', '2026-10-05', false);
    const allDay = event('all-day', '2026-10-04', '2026-10-05');
    const multiDay = event('multi-day', '2026-10-05', '2026-10-08');
    const grid = selectCalendarMonthGrid(
      [timed, allDay, multiDay],
      '2026-10-01',
      '2026-09-20',
    );
    const eventsOn = (date: string) =>
      grid.days.find(day => day.localDate === date)?.events ?? [];

    assert.deepEqual(
      eventsOn('2026-10-04').map(item => item.id),
      ['all-day', 'timed'],
    );
    assert.deepEqual(
      ['2026-10-05', '2026-10-06', '2026-10-07'].map(date =>
        eventsOn(date).map(item => item.id)
      ),
      [['multi-day'], ['multi-day'], ['multi-day']],
    );
    assert.deepEqual(timed.profileAssignment, eventsOn('2026-10-04')[1].profileAssignment);
  });

  it('keeps the October DST transition as civil dates rather than elapsed hours', () => {
    const grid = selectCalendarMonthGrid([], '2026-10-01', '2026-09-20');
    assert.equal(grid.gridStart, '2026-09-27');
    assert.equal(grid.gridEndExclusive, '2026-11-01');
    assert.equal(grid.days[28].localDate, '2026-10-25');
    assert.equal(grid.days[34].localDate, '2026-10-31');
  });
});
