import {
  getCalendarHouseholdDate,
  shiftCalendarLocalDate,
  type CalendarEvent,
} from './calendarModel';

export const HOME_CALENDAR_EVENT_LIMIT = 8;

export type CalendarOutlook = {
  todayEvents: CalendarEvent[];
  tomorrowEvents: CalendarEvent[];
  comingUpEvents: CalendarEvent[];
};

function overlapsLocalDate(
  event: CalendarEvent,
  localDate: string
): boolean {
  return event.startLocalDate <= localDate &&
    event.endLocalDateExclusive > localDate;
}

function compareEvents(
  first: CalendarEvent,
  second: CalendarEvent
): number {
  const localDateOrder =
    first.startLocalDate.localeCompare(second.startLocalDate);

  if (localDateOrder !== 0) return localDateOrder;

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

export function selectCalendarOutlook(
  events: readonly CalendarEvent[],
  now: Date,
  timeZone: string,
  limit = HOME_CALENDAR_EVENT_LIMIT
): CalendarOutlook {
  const today = getCalendarHouseholdDate(now, timeZone);
  const tomorrow = shiftCalendarLocalDate(today, 1);
  const dayAfterTomorrow = shiftCalendarLocalDate(today, 2);
  const todayEvents: CalendarEvent[] = [];
  const tomorrowEvents: CalendarEvent[] = [];
  const comingUpEvents: CalendarEvent[] = [];

  [...events].sort(compareEvents).forEach(event => {
    if (overlapsLocalDate(event, today)) {
      todayEvents.push(event);
      return;
    }

    if (overlapsLocalDate(event, tomorrow)) {
      tomorrowEvents.push(event);
      return;
    }

    if (
      event.endLocalDateExclusive > dayAfterTomorrow &&
      event.startLocalDate >= dayAfterTomorrow
    ) {
      comingUpEvents.push(event);
    }
  });

  const displayedEvents = [
    ...todayEvents,
    ...tomorrowEvents,
    ...comingUpEvents,
  ].slice(0, Math.max(0, limit));
  const displayedIds = new Set(
    displayedEvents.map(event => event.id)
  );

  return {
    todayEvents: todayEvents.filter(event => displayedIds.has(event.id)),
    tomorrowEvents: tomorrowEvents.filter(event => displayedIds.has(event.id)),
    comingUpEvents: comingUpEvents.filter(event => displayedIds.has(event.id)),
  };
}
