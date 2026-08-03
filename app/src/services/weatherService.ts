import { apiGet } from './apiClient';

const WEATHER_CONFIG = {
  latitude: 51.9172,
  longitude: -0.6603,
  locationName: 'Leighton Buzzard',
  refreshMinutes: 30,
};

type OpenMeteoCurrentWeather = {
  temperature_2m: number;
  apparent_temperature: number;
  relative_humidity_2m: number;
  weather_code: number;
};

type OpenMeteoDailyWeather = {
  temperature_2m_max: number[];
  temperature_2m_min: number[];
};

type OpenMeteoResponse = {
  current: OpenMeteoCurrentWeather;
  daily: OpenMeteoDailyWeather;
};

export type WeatherData = {
  temperature: number;
  feelsLike: number;
  humidityPercent: number;
  high: number;
  low: number;
  condition: string;
  weatherCode: number;
  location: string;
  updatedAt: string;
};

function getCondition(code: number): string {
  const conditions: Record<number, string> = {
    0: 'Clear',
    1: 'Mostly Clear',
    2: 'Partly Cloudy',
    3: 'Cloudy',
    45: 'Fog',
    48: 'Freezing Fog',
    51: 'Light Drizzle',
    53: 'Drizzle',
    55: 'Heavy Drizzle',
    61: 'Light Rain',
    63: 'Rain',
    65: 'Heavy Rain',
    71: 'Light Snow',
    73: 'Snow',
    75: 'Heavy Snow',
    80: 'Rain Showers',
    81: 'Heavy Showers',
    95: 'Thunderstorm',
  };

  return conditions[code] ?? 'Unknown';
}

export async function getCurrentWeather(): Promise<WeatherData> {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${WEATHER_CONFIG.latitude}` +
    `&longitude=${WEATHER_CONFIG.longitude}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code' +
    '&daily=temperature_2m_max,temperature_2m_min' +
    '&forecast_days=1' +
    '&timezone=Europe%2FLondon';

  const data = await apiGet<OpenMeteoResponse>(url);

  return {
    temperature: Math.round(data.current.temperature_2m),
    feelsLike: Math.round(data.current.apparent_temperature),
    humidityPercent: data.current.relative_humidity_2m,
    high: Math.round(data.daily.temperature_2m_max[0]),
    low: Math.round(data.daily.temperature_2m_min[0]),
    condition: getCondition(data.current.weather_code),
    weatherCode: data.current.weather_code,
    location: WEATHER_CONFIG.locationName,

    updatedAt: new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

export const WEATHER_REFRESH_MS =
  WEATHER_CONFIG.refreshMinutes * 60 * 1000;