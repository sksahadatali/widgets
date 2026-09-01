import { apiGet } from './apiClient';
import { apiUrl } from './clientApi';
import type { CalendarEvent } from '../calendar/calendarModel';
import { getAppMode, getHouseholdConfig } from './householdConfigService';
export type { CalendarEvent };
export type CalendarData = { calendarUrl: string; generatedAt: string; timeZone: string; events: CalendarEvent[] };
export async function getCalendarEvents(): Promise<CalendarData> {
  if (getAppMode() === 'demo') return { calendarUrl: '', generatedAt: new Date().toISOString(), timeZone: getHouseholdConfig().location.timezone, events: [] };
  return apiGet<CalendarData>(apiUrl('/api/calendar'));
}
export const CALENDAR_REFRESH_MS = getHouseholdConfig().calendar.refreshMinutes * 60 * 1000;
