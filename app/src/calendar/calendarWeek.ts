import {
  getCalendarHouseholdDate,
  shiftCalendarLocalDate,
  type CalendarEvent,
} from './calendarModel';

export type RollingCalendarDay = {
  localDate: string;
  isToday: boolean;
  events: CalendarEvent[];
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
  const visibleEvents = events.filter(event => {
    if (event.allDay) return true;

    const end = new Date(event.end).getTime();

    return !Number.isNaN(end) && end > now.getTime();
  });

  return Array.from({ length: 7 }, (_, index) => {
    const localDate = shiftCalendarLocalDate(today, index);

    return {
      localDate,
      isToday: index === 0,
      events: visibleEvents
        .filter(event => overlapsDay(event, localDate))
        .sort(compareEvents),
    };
  });
}
