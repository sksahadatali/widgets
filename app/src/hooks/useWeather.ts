import { useCallback, useEffect, useState } from 'react';

import {
  getCurrentWeather,
  WEATHER_REFRESH_MS,
  type WeatherData,
} from '../services/weatherService';

type UseWeatherResult = {
  weather: WeatherData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useWeather(): UseWeatherResult {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);

      const weatherData = await getCurrentWeather();

      setWeather(weatherData);
    } catch (error) {
      console.error('Weather update failed:', error);

      setError('Weather unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const intervalId = window.setInterval(
      () => {
        void refresh();
      },
      WEATHER_REFRESH_MS
    );

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refresh]);

  return {
    weather,
    loading,
    error,
    refresh,
  };
}