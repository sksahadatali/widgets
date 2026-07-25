import {
    useCallback,
    useEffect,
    useState,
  } from 'react';
  
  import {
    CALENDAR_REFRESH_MS,
    getNextEvent,
    type CalendarData,
  } from '../services/calendarService';
  
  type UseCalendarResult = {
    calendar: CalendarData | null;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
  };
  
  export function useCalendar(): UseCalendarResult {
    const [calendar, setCalendar] =
      useState<CalendarData | null>(null);
  
    const [loading, setLoading] =
      useState(true);
  
    const [error, setError] =
      useState<string | null>(null);
  
    const refresh = useCallback(async () => {
      try {
        setError(null);
  
        const calendarData =
          await getNextEvent();
  
        setCalendar(calendarData);
      } catch (error) {
        console.error(
          'Calendar update failed:',
          error
        );
  
        setError('Calendar unavailable');
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
        window.clearInterval(intervalId);
      };
    }, [refresh]);
  
    return {
      calendar,
      loading,
      error,
      refresh,
    };
  }