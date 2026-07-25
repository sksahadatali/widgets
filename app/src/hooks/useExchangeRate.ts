import {
    useCallback,
    useEffect,
    useState,
  } from 'react';
  
  import {
    CURRENCY_REFRESH_MS,
    getExchangeRate,
    type CurrencyData,
  } from '../services/currencyService';
  
  type UseExchangeRateResult = {
    currency: CurrencyData | null;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
  };
  
  export function useExchangeRate(): UseExchangeRateResult {
    const [currency, setCurrency] =
      useState<CurrencyData | null>(null);
  
    const [loading, setLoading] =
      useState(true);
  
    const [error, setError] =
      useState<string | null>(null);
  
    const refresh = useCallback(async () => {
      try {
        setError(null);
  
        const currencyData =
          await getExchangeRate();
  
        setCurrency(currencyData);
      } catch (error) {
        console.error(
          'Currency update failed:',
          error
        );
  
        setError('Exchange rate unavailable');
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
          CURRENCY_REFRESH_MS
        );
  
      return () => {
        window.clearInterval(intervalId);
      };
    }, [refresh]);
  
    return {
      currency,
      loading,
      error,
      refresh,
    };
  }