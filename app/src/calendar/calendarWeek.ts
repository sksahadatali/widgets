import {
  formatCalendarLocalDate,
  getCalendarHouseholdDate,
  shiftCalendarLocalDate,
  type CalendarEvent,
} from './calendarModel';

export type RollingCalendarDay = {
  localDate: string;
  isToday: boolean;
  events: CalendarEvent[];
};

export type CalendarWindowState = {
  householdToday: string;
  startLocalDate: string;
};

function compareEvents(
  first: CalendarEvent,
  second: CalendarEvent
): number {
  if (first.allDay !== second.allDay) {
    return first.allDay ? -1 : 1;
  }

  const instantOrder =
    new Date(first.start).getTime() -
    new Date(second.start).getTime();

  if (!Number.isNaN(instantOrder) && instantOrder !== 0) {
    return instantOrder;
  }

  return first.id.localeCompare(second.id);
}

function overlapsDay(
  event: CalendarEvent,
  localDate: string
): boolean {
  return event.startLocalDate <= localDate &&
    event.endLocalDateExclusive > localDate;
}

export function selectRollingCalendarWeek(
  events: readonly CalendarEvent[],
  now: Date,
  timeZone: string
): RollingCalendarDay[] {
  const today = getCalendarHouseholdDate(now, timeZone);

  return selectCalendarWindow(events, today, today);
}

export function selectCalendarWindow(
  events: readonly CalendarEvent[],
  requestedStartLocalDate: string,
  householdToday: string
): RollingCalendarDay[] {
  const startLocalDate = requestedStartLocalDate < householdToday
    ? householdToday
    : requestedStartLocalDate;

  return Array.from({ length: 7 }, (_, index) => {
    const localDate = shiftCalendarLocalDate(startLocalDate, index);

    return {
      localDate,
      isToday: localDate === householdToday,
      events: events
        .filter(event => overlapsDay(event, localDate))
        .sort(compareEvents),
    };
  });
}

export function createCalendarWindowState(
  now: Date,
  timeZone: string
): CalendarWindowState {
  const householdToday = getCalendarHouseholdDate(now, timeZone);

  return {
    householdToday,
    startLocalDate: householdToday,
  };
}

export function refreshCalendarWindowToday(
  current: CalendarWindowState,
  now: Date,
  timeZone: string
): CalendarWindowState {
  const householdToday = getCalendarHouseholdDate(now, timeZone);

  return {
    householdToday,
    startLocalDate: current.startLocalDate < householdToday
      ? householdToday
      : current.startLocalDate,
  };
}

export function canNavigateCalendarWindowPrevious(
  state: CalendarWindowState
): boolean {
  return shiftCalendarLocalDate(state.startLocalDate, -7) >=
    state.householdToday;
}

export function navigateCalendarWindow(
  state: CalendarWindowState,
  days: -7 | 7
): CalendarWindowState {
  const candidate = shiftCalendarLocalDate(
    state.startLocalDate,
    days
  );

  if (candidate < state.householdToday) {
    return state;
  }

  return {
    ...state,
    startLocalDate: candidate,
  };
}

export function resetCalendarWindowToToday(
  state: CalendarWindowState
): CalendarWindowState {
  return {
    ...state,
    startLocalDate: state.householdToday,
  };
}

export function formatCalendarWindowRange(
  startLocalDate: string
): string {
  const endLocalDate = shiftCalendarLocalDate(startLocalDate, 6);
  const crossesYear =
    startLocalDate.slice(0, 4) !== endLocalDate.slice(0, 4);
  const start = formatCalendarLocalDate(startLocalDate, {
    day: 'numeric',
    month: 'short',
    ...(crossesYear ? { year: 'numeric' } : {}),
  });
  const end = formatCalendarLocalDate(endLocalDate, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return `${start} – ${end}`;
}
