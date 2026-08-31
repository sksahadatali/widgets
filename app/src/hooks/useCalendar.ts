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

import {
  selectCalendarOutlook,
} from '../calendar/calendarOutlook';

import {
  getHouseholdConfig,
} from '../services/householdConfigService';

type UseCalendarResult = {
  events: CalendarEvent[];
  todayEvents: CalendarEvent[];
  tomorrowEvents: CalendarEvent[];
  comingUpEvents: CalendarEvent[];
  calendarUrl: string;
  timeZone: string;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

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
    const initialRefreshId =
      window.setTimeout(
        () => {
          void refresh();
        },
        0
      );

    const intervalId =
      window.setInterval(
        () => {
          void refresh();
        },
        CALENDAR_REFRESH_MS
      );

    return () => {
      window.clearTimeout(
        initialRefreshId
      );

      window.clearInterval(
        intervalId
      );
    };
  }, [refresh]);

  const groupedEvents =
    useMemo(() => {
      return selectCalendarOutlook(
        calendarData?.events ?? [],
        new Date(),
        calendarData?.timeZone ??
          getHouseholdConfig().location.timezone
      );
    }, [calendarData]);

  return {
    events:
      calendarData?.events ?? [],
    todayEvents:
      groupedEvents.todayEvents,
    tomorrowEvents:
      groupedEvents.tomorrowEvents,
    comingUpEvents:
      groupedEvents.comingUpEvents,
    calendarUrl:
      calendarData?.calendarUrl ||
      'https://calendar.google.com/calendar/u/0/r',
    timeZone:
      calendarData?.timeZone ??
      getHouseholdConfig().location.timezone,
    loading,
    error,
    refresh,
  };
}
