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
  type CalendarWindowRequest,
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

type LoadedCalendarData = {
  requestKey: string;
  data: CalendarData;
};

type CalendarError = {
  requestKey: string;
  message: string;
};

export function useCalendar(
  request: CalendarWindowRequest = {}
): UseCalendarResult {
  const startLocalDate = request.startLocalDate;
  const days = request.days;
  const [
    calendarData,
    setCalendarData,
  ] = useState<LoadedCalendarData | null>(
    null
  );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<CalendarError | null>(null);
  const requestId = useRef(0);
  const loadedWindow = useRef<
    string | null | undefined
  >(undefined);
  const requestKey = `${startLocalDate ?? 'default'}:${days ?? 7}`;

  const refresh = useCallback(async () => {
    const currentRequestId = requestId.current + 1;
    requestId.current = currentRequestId;

    if (loadedWindow.current !== requestKey) {
      setCalendarData(null);
      setLoading(true);
    }

    try {
      setError(null);

      const data =
        await getCalendarEvents({ startLocalDate, days });

      if (requestId.current !== currentRequestId) return;

      setCalendarData({ requestKey, data });
      loadedWindow.current = requestKey;
    } catch (refreshError) {
      if (requestId.current !== currentRequestId) return;

      console.error(
        'Calendar update failed:',
        refreshError
      );

      setError({ requestKey, message: 'Calendar unavailable' });
    } finally {
      if (requestId.current === currentRequestId) {
        setLoading(false);
      }
    }
  }, [days, requestKey, startLocalDate]);

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

  const activeData = calendarData?.requestKey === requestKey
    ? calendarData.data
    : null;
  const activeError = error?.requestKey === requestKey
    ? error.message
    : null;
  const groupedEvents =
    useMemo(() => {
      return selectCalendarOutlook(
        activeData?.events ?? [],
        new Date(),
        activeData?.timeZone ??
          getHouseholdConfig().location.timezone
      );
    }, [activeData]);

  return {
    events:
      activeData?.events ?? [],
    todayEvents:
      groupedEvents.todayEvents,
    tomorrowEvents:
      groupedEvents.tomorrowEvents,
    comingUpEvents:
      groupedEvents.comingUpEvents,
    calendarUrl:
      activeData?.calendarUrl ||
      'https://calendar.google.com/calendar/u/0/r',
    timeZone:
      activeData?.timeZone ??
      getHouseholdConfig().location.timezone,
    loading: loading || (activeData === null && activeError === null),
    error: activeError,
    refresh,
  };
}
