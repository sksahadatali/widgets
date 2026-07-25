import { apiGet } from './apiClient';

const CALENDAR_CONFIG = {
  endpoint:
    'https://script.google.com/macros/s/AKfycbz2U7L58NPsWI8linbcs8NN9rKlbQ2NFKwKLEtqWxqIhiSI2YWwN2Wy9d32zokiEIHSHA/exec',
  refreshMinutes: 15,
};

type CalendarApiResponse = {
  success: boolean;
  title: string;
  time?: string;
  meta?: string;
};

export type CalendarData = {
  title: string;
  time: string;
  meta: string;
};

export async function getNextEvent(): Promise<CalendarData> {
  const data =
    await apiGet<CalendarApiResponse>(
      CALENDAR_CONFIG.endpoint
    );

  if (!data.success) {
    throw new Error(
      'Calendar API returned an unsuccessful response'
    );
  }

  return {
    title: data.title || 'No Events',
    time: data.time || '',
    meta: data.meta || '',
  };
}

export const CALENDAR_REFRESH_MS =
  CALENDAR_CONFIG.refreshMinutes * 60 * 1000;