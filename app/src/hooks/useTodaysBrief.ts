import { useMemo } from 'react';

import { useWeather } from './useWeather';
import { usePrayerTimes } from './usePrayerTimes';
import { useCalendar } from './useCalendar';
import { useNest } from './useNest';

import {
  buildTodaysBrief,
  type BriefData,
} from '../services/briefService';

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
    calendar,
    loading: calendarLoading,
    error: calendarError,
  } = useCalendar();

  const {
    nest,
    loading: nestLoading,
    error: nestError,
  } = useNest();

  const brief = useMemo(
    () =>
      buildTodaysBrief({
        weather,
        prayer,
        calendar,
        nest,
      }),
    [
      weather,
      prayer,
      calendar,
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