import { apiGet } from './apiClient';
import { apiUrl } from './clientApi';
export interface WeatherForecastDay { day: string; icon: string; high: number; low: number }
export type WeatherData = { temperature: number; feelsLike: number; humidityPercent: number; high: number; low: number; condition: string; weatherCode: number; location: string; updatedAt: string; forecast: WeatherForecastDay[] };
export async function getCurrentWeather(): Promise<WeatherData> { return apiGet<WeatherData>(apiUrl('/api/weather')); }
export const WEATHER_REFRESH_MS = 30 * 60 * 1000;
