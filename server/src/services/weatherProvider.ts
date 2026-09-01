import { getHouseholdConfig } from '../config/householdConfig.js';

type OpenMeteoResponse = {
  current: { temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; weather_code: number };
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
};

const conditions: Record<number, string> = { 0: 'Clear', 1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Cloudy', 45: 'Fog', 48: 'Freezing Fog', 51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle', 61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain', 71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow', 80: 'Rain Showers', 81: 'Heavy Showers', 95: 'Thunderstorm' };
const icon = (code: number) => [0, 1].includes(code) ? 'sun' : code === 2 ? 'partly-cloudy' : code === 3 ? 'cloud' : [45, 48].includes(code) ? 'fog' : [51, 53, 55, 61, 63, 65, 80, 81].includes(code) ? 'rain' : [71, 73, 75].includes(code) ? 'snow' : code === 95 ? 'storm' : 'cloud';

export async function getWeather(
  fetcher: typeof fetch = fetch,
  location = getHouseholdConfig().location
) {
  const parameters = new URLSearchParams({
    latitude: String(location.latitude), longitude: String(location.longitude),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min', forecast_days: '4', timezone: location.timezone,
  });
  const response = await fetcher(`https://api.open-meteo.com/v1/forecast?${parameters}`);
  if (!response.ok) throw new Error('Weather provider request failed.');
  const data = await response.json() as OpenMeteoResponse;
  return {
    temperature: Math.round(data.current.temperature_2m), feelsLike: Math.round(data.current.apparent_temperature),
    humidityPercent: data.current.relative_humidity_2m, high: Math.round(data.daily.temperature_2m_max[0]), low: Math.round(data.daily.temperature_2m_min[0]),
    condition: conditions[data.current.weather_code] ?? 'Unknown', weatherCode: data.current.weather_code, location: location.name,
    updatedAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    forecast: data.daily.time.slice(1, 4).map((date, index) => ({
      day: new Date(date).toLocaleDateString('en-GB', { weekday: 'short' }), icon: icon(data.daily.weather_code[index + 1]),
      high: Math.round(data.daily.temperature_2m_max[index + 1]), low: Math.round(data.daily.temperature_2m_min[index + 1]),
    })),
  };
}
