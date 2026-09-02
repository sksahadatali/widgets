import {
  useCallback,
  useEffect,
  useMemo,
} from 'react';

import { useWeather } from './useWeather';
import { usePrayerTimes } from './usePrayerTimes';
import { useCalendar } from './useCalendar';
import { useNest } from './useNest';

import {
  buildTodaysBrief,
  type BriefData,
} from '../services/briefService';

import {
  refreshTravelInfoIfNeeded,
} from '../services/googleMapsService';

import {
  getTravelSettings,
} from '../services/travelSettingsService';

import {
  selectSchoolBriefInsight,
} from '../calendar/schoolBrief';

type UseTodaysBriefResult = {
  brief: BriefData;
  loading: boolean;
  hasError: boolean;
};

const ONE_MINUTE = 1 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;
const SIXTY_MINUTES = 60 * 60 * 1000;

function getTravelRefreshMs(
  meetingTime: Date,
  leaveBufferMinutes: number
): number {

  const leaveTime = new Date(
    meetingTime.getTime() -
    leaveBufferMinutes * 60 * 1000
  );

  const minutesUntilLeave =
    Math.max(
      0,
      Math.round(
        (leaveTime.getTime() - Date.now()) /
        (1000 * 60)
      )
    );

  if (minutesUntilLeave > 240) {
    return SIXTY_MINUTES;
  }

  if (minutesUntilLeave > 120) {
    return THIRTY_MINUTES;
  }

  if (minutesUntilLeave > 60) {
    return TEN_MINUTES;
  }

  if (minutesUntilLeave > 30) {
    return FIVE_MINUTES;
  }

  return ONE_MINUTE;
}

export function useTodaysBrief(): UseTodaysBriefResult {

  const {
    weather,
    loading: weatherLoading,
    error: weatherError,
  } = useWeather();

  const {
    prayer,
    loading: prayerLoading,
    error: prayerError,
  } = usePrayerTimes();

  const {
    events,
    todayEvents,
    timeZone,
    loading: calendarLoading,
    error: calendarError,
  } = useCalendar();

  const {
    nest,
    loading: nestLoading,
    error: nestError,
  } = useNest();

  const updateTravel = useCallback(async () => {

    const now =
      new Date();

    const nextEvent =
      todayEvents
        .filter(event => !event.allDay)
        .filter(event => !!event.location)
        .filter(
          event =>
            new Date(event.start) > now
        )
        .sort(
          (a, b) =>
            new Date(a.start).getTime() -
            new Date(b.start).getTime()
        )[0];

    if (!nextEvent) {
      return;
    }

    const meetingTime =
      new Date(nextEvent.start);

    try {

      await refreshTravelInfoIfNeeded(
        nextEvent.location!,
        meetingTime
      );

    } catch (error) {

      console.error(
        'Travel update failed:',
        error
      );

    }

  }, [todayEvents]);

  // Refresh immediately whenever calendar events change
  useEffect(() => {
    void updateTravel();
  }, [updateTravel]);

  // Refresh travel information every 5 minutes
  useEffect(() => {

    const settings =
      getTravelSettings();
  
    const now =
      new Date();
  
    const nextEvent =
      todayEvents
        .filter(event => !event.allDay)
        .filter(event => !!event.location)
        .filter(
          event => new Date(event.start) > now
        )
        .sort(
          (a, b) =>
            new Date(a.start).getTime() -
            new Date(b.start).getTime()
        )[0];
  
    if (!nextEvent) {
      return;
    }
  
    const refreshMs =
      getTravelRefreshMs(
        new Date(nextEvent.start),
        settings.leaveBufferMinutes
      );
  
    const intervalId =
      window.setInterval(() => {
        void updateTravel();
      }, refreshMs);
  
    return () => {
      window.clearInterval(intervalId);
    };
  
  }, [todayEvents, updateTravel]);

  const brief = useMemo(
    () => {
      const schoolInsight =
        selectSchoolBriefInsight(
          events,
          timeZone,
          new Date()
        );

      return buildTodaysBrief({
        weather,
        prayer,
        todayEvents,
        nest,
        schoolInsight,
      });
    },
    [
      weather,
      prayer,
      events,
      todayEvents,
      timeZone,
      nest,
    ]
  );

  return {
    brief,

    loading:
      weatherLoading ||
      prayerLoading ||
      calendarLoading ||
      nestLoading,

    hasError: Boolean(
      weatherError ||
      prayerError ||
      calendarError ||
      nestError
    ),
  };
}
