import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  type CalendarEvent,
  type CalendarWindowRequest,
} from '../services/calendarService';

import {
  canonicalCalendarQuery,
  getCalendarQueryStore,
  type CalendarQuerySnapshot,
} from '../calendar/calendarQueryStore';

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
  hasData: boolean;
  refreshing: boolean;
  fresh: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

type LoadedCalendarSnapshot = {
  requestKey: string;
  snapshot: CalendarQuerySnapshot;
};

export function useCalendar(
  request: CalendarWindowRequest = {}
): UseCalendarResult {
  const startLocalDate = request.startLocalDate;
  const days = request.days;
  const store = getCalendarQueryStore();
  const sharedRequest = useMemo<CalendarWindowRequest>(
    () => ({
      ...(startLocalDate ? { startLocalDate } : {}),
      ...(days === undefined ? {} : { days }),
    }),
    [days, startLocalDate]
  );
  const requestKey = canonicalCalendarQuery(
    sharedRequest,
    new Date(),
    getHouseholdConfig().location.timezone
  ).key;
  const [loadedSnapshot, setLoadedSnapshot] =
    useState<LoadedCalendarSnapshot>(() => ({
      requestKey,
      snapshot: store.getSnapshot(sharedRequest),
    }));
  const activeSnapshot = loadedSnapshot.requestKey === requestKey
    ? loadedSnapshot.snapshot
    : store.getSnapshot(sharedRequest);

  const refresh = useCallback(async () => {
    try {
      await store.refresh(sharedRequest);
    } catch (refreshError) {
      console.error(
        'Calendar update failed:',
        refreshError
      );
    }
  }, [sharedRequest, store]);

  useEffect(() => {
    const update = () => {
      setLoadedSnapshot({
        requestKey,
        snapshot: store.getSnapshot(sharedRequest),
      });
    };
    const unsubscribe = store.subscribe(sharedRequest, update);
    update();
    void store.ensure(sharedRequest).catch(() => undefined);

    return () => {
      unsubscribe();
    };
  }, [requestKey, sharedRequest, store]);

  const activeData = activeSnapshot.data;
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
    hasData: activeData !== null,
    refreshing: activeSnapshot.refreshing,
    fresh: activeSnapshot.isFresh && !activeSnapshot.refreshing,
    loading: activeSnapshot.loading ||
      (activeData === null && activeSnapshot.error === null),
    error: activeSnapshot.error,
    refresh,
  };
}
