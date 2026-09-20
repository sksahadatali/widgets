import {
  formatCalendarLocalDate,
  getCalendarHouseholdDate,
  shiftCalendarLocalDate,
  type CalendarEvent,
} from './calendarModel';

export type CalendarMonthState = {
  householdToday: string;
  selectedMonthStart: string;
};

export type CalendarMonthDay = {
  localDate: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isBeforeToday: boolean;
  events: CalendarEvent[];
};

export type CalendarMonthGrid = {
  monthStart: string;
  gridStart: string;
  gridEndExclusive: string;
  requestStart: string;
  requestDays: number;
  weekCount: 4 | 5 | 6;
  days: CalendarMonthDay[];
};

function monthStart(localDate: string): string {
  shiftCalendarLocalDate(localDate, 0);
  return `${localDate.slice(0, 7)}-01`;
}

function shiftMonth(localDate: string, months: number): string {
  const start = monthStart(localDate);
  const [year, month] = start.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + months, 1));

  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    '01',
  ].join('-');
}

function dayDifference(start: string, endExclusive: string): number {
  const instant = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };

  return Math.round(
    (instant(endExclusive) - instant(start)) / 86_400_000
  );
}

function compareEvents(
  first: CalendarEvent,
  second: CalendarEvent
): number {
  if (first.allDay !== second.allDay) return first.allDay ? -1 : 1;

  const instantOrder =
    new Date(first.start).getTime() -
    new Date(second.start).getTime();

  if (!Number.isNaN(instantOrder) && instantOrder !== 0) {
    return instantOrder;
  }

  return first.id.localeCompare(second.id);
}

function eventsForDay(
  events: readonly CalendarEvent[],
  localDate: string
): CalendarEvent[] {
  return events
    .filter(event =>
      event.startLocalDate <= localDate &&
      event.endLocalDateExclusive > localDate
    )
    .sort(compareEvents);
}

export function createCalendarMonthState(
  now: Date,
  timeZone: string
): CalendarMonthState {
  const householdToday = getCalendarHouseholdDate(now, timeZone);

  return {
    householdToday,
    selectedMonthStart: monthStart(householdToday),
  };
}

export function refreshCalendarMonthToday(
  current: CalendarMonthState,
  now: Date,
  timeZone: string
): CalendarMonthState {
  const householdToday = getCalendarHouseholdDate(now, timeZone);
  const householdMonthStart = monthStart(householdToday);

  return {
    householdToday,
    selectedMonthStart:
      current.selectedMonthStart < householdMonthStart
        ? householdMonthStart
        : current.selectedMonthStart,
  };
}

export function canNavigateCalendarMonthPrevious(
  state: CalendarMonthState
): boolean {
  return state.selectedMonthStart > monthStart(state.householdToday);
}

export function navigateCalendarMonth(
  state: CalendarMonthState,
  months: -1 | 1
): CalendarMonthState {
  const candidate = shiftMonth(state.selectedMonthStart, months);
  if (candidate < monthStart(state.householdToday)) return state;

  return { ...state, selectedMonthStart: candidate };
}

export function resetCalendarMonthToToday(
  state: CalendarMonthState
): CalendarMonthState {
  return {
    ...state,
    selectedMonthStart: monthStart(state.householdToday),
  };
}

export function formatCalendarMonthLabel(month: string): string {
  return formatCalendarLocalDate(monthStart(month), {
    month: 'long',
    year: 'numeric',
  });
}

export function selectCalendarMonthGrid(
  events: readonly CalendarEvent[],
  selectedMonth: string,
  householdToday: string
): CalendarMonthGrid {
  const selectedMonthStart = monthStart(selectedMonth);
  const nextMonthStart = shiftMonth(selectedMonthStart, 1);
  const [year, month, day] = selectedMonthStart.split('-').map(Number);
  const leadingDays = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const nextParts = nextMonthStart.split('-').map(Number);
  const trailingDays = (
    7 - new Date(Date.UTC(
      nextParts[0],
      nextParts[1] - 1,
      nextParts[2]
    )).getUTCDay()
  ) % 7;
  const gridStart = shiftCalendarLocalDate(
    selectedMonthStart,
    -leadingDays
  );
  const gridEndExclusive = shiftCalendarLocalDate(
    nextMonthStart,
    trailingDays
  );
  const requestStart = gridStart < householdToday
    ? householdToday
    : gridStart;
  const requestDays = dayDifference(requestStart, gridEndExclusive);
  const totalDays = dayDifference(gridStart, gridEndExclusive);
  const weekCount = totalDays / 7;

  if (![4, 5, 6].includes(weekCount) || requestDays < 1 || requestDays > 42) {
    throw new Error('Calendar month grid is invalid.');
  }

  return {
    monthStart: selectedMonthStart,
    gridStart,
    gridEndExclusive,
    requestStart,
    requestDays,
    weekCount: weekCount as 4 | 5 | 6,
    days: Array.from({ length: totalDays }, (_, index) => {
      const localDate = shiftCalendarLocalDate(gridStart, index);
      const isBeforeToday = localDate < householdToday;

      return {
        localDate,
        isCurrentMonth:
          localDate >= selectedMonthStart &&
          localDate < nextMonthStart,
        isToday: localDate === householdToday,
        isBeforeToday,
        events: isBeforeToday
          ? []
          : eventsForDay(events, localDate),
      };
    }),
  };
}
