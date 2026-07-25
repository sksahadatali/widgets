import {
    useCallback,
    useEffect,
    useState,
  } from 'react';
  
  import {
    fetchNestStatus,
    type NestStatus,
  } from '../services/nestService';
  
  const NEST_REFRESH_MS = 60 * 1000;
  
  type UseNestResult = {
    nest: NestStatus | null;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
  };
  
  export function useNest(): UseNestResult {
    const [nest, setNest] =
      useState<NestStatus | null>(null);
  
    const [loading, setLoading] =
      useState(true);
  
    const [error, setError] =
      useState<string | null>(null);
  
    const refresh = useCallback(async () => {
      try {
        setError(null);
  
        const nestData =
          await fetchNestStatus();
  
        setNest(nestData);
      } catch (error) {
        console.error(
          'Nest update failed:',
          error
        );
  
        setError('Nest unavailable');
      } finally {
        setLoading(false);
      }
    }, []);
  
    useEffect(() => {
      void refresh();
  
      const intervalId =
        window.setInterval(() => {
          void refresh();
        }, NEST_REFRESH_MS);
  
      return () => {
        window.clearInterval(intervalId);
      };
    }, [refresh]);
  
    return {
      nest,
      loading,
      error,
      refresh,
    };
  }