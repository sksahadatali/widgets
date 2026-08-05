import {
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

type UseTodaysBriefResult = {
  brief: BriefData;
  loading: boolean;
  hasError: boolean;
};

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
    todayEvents,
    loading: calendarLoading,
    error: calendarError,
  } = useCalendar();

  const {
    nest,
    loading: nestLoading,
    error: nestError,
  } = useNest();

  useEffect(() => {

    async function updateTravel() {

      const settings =
        getTravelSettings();
    
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
    
      console.log('Next event selected:', {
        title: nextEvent.title,
        location: nextEvent.location,
        start: nextEvent.start,
      });
    
      try {
    
        await refreshTravelInfoIfNeeded(
          settings.homeAddress,
          nextEvent.location!,
          meetingTime
        );
    
      } catch (error) {
    
        console.error(
          'Travel update failed:',
          error
        );
    
      }
    
    }

    void updateTravel();

  }, [todayEvents]);

  const brief = useMemo(
    () =>
      buildTodaysBrief({
        weather,
        prayer,
        todayEvents,
        nest,
      }),
    [
      weather,
      prayer,
      todayEvents,
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