import {
    useCallback,
    useEffect,
    useState,
  } from 'react';
  
  import {
    getNextPrayer,
    PRAYER_REFRESH_MS,
    type PrayerData,
  } from '../services/prayerService';
  
  type UsePrayerTimesResult = {
    prayer: PrayerData | null;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
  };
  
  export function usePrayerTimes(): UsePrayerTimesResult {
    const [prayer, setPrayer] =
      useState<PrayerData | null>(null);
  
    const [loading, setLoading] =
      useState(true);
  
    const [error, setError] =
      useState<string | null>(null);
  
    const refresh = useCallback(async () => {
      try {
        setError(null);
  
        const prayerData =
          await getNextPrayer();
  
        setPrayer(prayerData);
      } catch (error) {
        console.error(
          'Prayer update failed:',
          error
        );
  
        setError('Prayer times unavailable');
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
          PRAYER_REFRESH_MS
        );
  
      return () => {
        window.clearInterval(intervalId);
      };
    }, [refresh]);
  
    return {
      prayer,
      loading,
      error,
      refresh,
    };
  }