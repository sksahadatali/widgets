import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  getCalendarEventsPath,
} from '../../app/src/services/calendarService';
import {
  createCalendarWindowState,
  navigateCalendarWindow,
  resetCalendarWindowToToday,
} from '../../app/src/calendar/calendarWeek';

describe('Calendar window client architecture', () => {
  it('keeps Home on the existing default endpoint and requests explicit page windows', () => {
    assert.equal(getCalendarEventsPath(), '/api/calendar');
    assert.equal(
      getCalendarEventsPath('2026-09-27'),
      '/api/calendar?startDate=2026-09-27',
    );
    assert.throws(
      () => getCalendarEventsPath('2026-02-30'),
      /YYYY-MM-DD/,
    );
  });

  it('maps Next, Previous, and Today state to the matching backend window', () => {
    const today = createCalendarWindowState(
      new Date('2026-09-20T08:00:00.000Z'),
      'Europe/London',
    );
    const next = navigateCalendarWindow(today, 7);
    const previous = navigateCalendarWindow(next, -7);
    const reset = resetCalendarWindowToToday(next);

    assert.equal(
      getCalendarEventsPath(today.startLocalDate),
      '/api/calendar?startDate=2026-09-20',
    );
    assert.equal(
      getCalendarEventsPath(next.startLocalDate),
      '/api/calendar?startDate=2026-09-27',
    );
    assert.equal(
      getCalendarEventsPath(previous.startLocalDate),
      '/api/calendar?startDate=2026-09-20',
    );
    assert.equal(
      getCalendarEventsPath(reset.startLocalDate),
      '/api/calendar?startDate=2026-09-20',
    );
  });

  it('keeps compact Home consumers parameter-free while Calendar supplies its selected start', async () => {
    const homeCalendar = await readFile(
      new URL('../../app/src/components/modules/Calendar/Calendar.tsx', import.meta.url),
      'utf8',
    );
    const quickStatus = await readFile(
      new URL('../../app/src/components/modules/QuickStatus/CalendarCard.tsx', import.meta.url),
      'utf8',
    );
    const calendarPage = await readFile(
      new URL('../../app/src/pages/WeeklyCalendar.tsx', import.meta.url),
      'utf8',
    );

    assert.match(homeCalendar, /useCalendar\(\)/);
    assert.match(quickStatus, /useCalendar\(\)/);
    assert.match(calendarPage, /useCalendar\(windowState\.startLocalDate\)/);
  });
});
