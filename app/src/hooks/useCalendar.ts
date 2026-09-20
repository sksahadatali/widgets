import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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

export function useCalendar(
  startLocalDate?: string
): UseCalendarResult {
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
  const requestId = useRef(0);
  const loadedWindow = useRef<
    string | null | undefined
  >(undefined);

  const refresh = useCallback(async () => {
    const currentRequestId = requestId.current + 1;
    const requestedWindow = startLocalDate ?? null;
    requestId.current = currentRequestId;

    if (loadedWindow.current !== requestedWindow) {
      setCalendarData(null);
      setLoading(true);
    }

    try {
      setError(null);

      const data =
        await getCalendarEvents(startLocalDate);

      if (requestId.current !== currentRequestId) return;

      setCalendarData(data);
      loadedWindow.current = requestedWindow;
    } catch (refreshError) {
      if (requestId.current !== currentRequestId) return;

      console.error(
        'Calendar update failed:',
        refreshError
      );

      setError(
        'Calendar unavailable'
      );
    } finally {
      if (requestId.current === currentRequestId) {
        setLoading(false);
      }
    }
  }, [startLocalDate]);

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
      requestId.current += 1;
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
