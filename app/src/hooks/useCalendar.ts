import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  CALENDAR_REFRESH_MS,
  getCalendarEvents,
  type CalendarData,
  type CalendarEvent,
} from '../services/calendarService';

type UseCalendarResult = {
  events: CalendarEvent[];
  todayEvents: CalendarEvent[];
  tomorrowEvents: CalendarEvent[];
  thisWeekEvents: CalendarEvent[];
  calendarUrl: string;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

function startOfDay(date: Date) {
  const result = new Date(date);

  result.setHours(0, 0, 0, 0);

  return result;
}

function addDays(
  date: Date,
  numberOfDays: number
) {
  const result = new Date(date);

  result.setDate(
    result.getDate() +
      numberOfDays
  );

  return result;
}

function endOfWeek(date: Date) {
  const result = startOfDay(date);
  const day = result.getDay();
  const daysUntilSunday =
    day === 0 ? 0 : 7 - day;

  result.setDate(
    result.getDate() +
      daysUntilSunday
  );

  result.setHours(
    23,
    59,
    59,
    999
  );

  return result;
}

function isInRange(
  event: CalendarEvent,
  rangeStart: Date,
  rangeEnd: Date
) {
  const eventStart =
    new Date(event.start);

  return (
    eventStart >= rangeStart &&
    eventStart < rangeEnd
  );
}

function sortEvents(
  events: CalendarEvent[]
) {
  return [...events].sort(
    (first, second) =>
      new Date(
        first.start
      ).getTime() -
      new Date(
        second.start
      ).getTime()
  );
}

export function useCalendar(): UseCalendarResult {
  const [
    calendarData,
    setCalendarData,
  ] = useState<CalendarData | null>(
    null
  );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);

      const data =
        await getCalendarEvents();

      setCalendarData(data);
    } catch (refreshError) {
      console.error(
        'Calendar update failed:',
        refreshError
      );

      setError(
        'Calendar unavailable'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const intervalId =
      window.setInterval(
        () => {
          void refresh();
        },
        CALENDAR_REFRESH_MS
      );

    return () => {
      window.clearInterval(
        intervalId
      );
    };
  }, [refresh]);

  const groupedEvents =
    useMemo(() => {
      const now = new Date();
      const todayStart =
        startOfDay(now);
      const tomorrowStart =
        addDays(todayStart, 1);
      const dayAfterTomorrow =
        addDays(todayStart, 2);
      const weekEnd =
        addDays(
          endOfWeek(now),
          1
        );

      const events =
        calendarData?.events ??
        [];

      return {
        todayEvents: sortEvents(
          events.filter(event =>
            isInRange(
              event,
              todayStart,
              tomorrowStart
            )
          )
        ),
        tomorrowEvents:
          sortEvents(
            events.filter(event =>
              isInRange(
                event,
                tomorrowStart,
                dayAfterTomorrow
              )
            )
          ),
        thisWeekEvents:
          sortEvents(
            events.filter(event =>
              isInRange(
                event,
                dayAfterTomorrow,
                weekEnd
              )
            )
          ),
      };
    }, [calendarData]);

  return {
    events:
      calendarData?.events ?? [],
    todayEvents:
      groupedEvents.todayEvents,
    tomorrowEvents:
      groupedEvents.tomorrowEvents,
    thisWeekEvents:
      groupedEvents.thisWeekEvents,
    calendarUrl:
      calendarData?.calendarUrl ||
      'https://calendar.google.com/calendar/u/0/r',
    loading,
    error,
    refresh,
  };
}
