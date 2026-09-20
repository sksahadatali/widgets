import { apiGet } from './apiClient';
import { apiUrl } from './clientApi';
import {
  shiftCalendarLocalDate,
  type CalendarAssignmentTarget,
  type CalendarEvent,
} from '../calendar/calendarModel';
import { getAppMode, getHouseholdConfig } from './householdConfigService';
export type { CalendarEvent };
export type CalendarData = { calendarUrl: string; generatedAt: string; timeZone: string; events: CalendarEvent[] };
export type CalendarWindowRequest = {
  startLocalDate?: string;
  days?: number;
};
export function getCalendarEventsPath(
  request: CalendarWindowRequest = {}
): string {
  const { startLocalDate, days } = request;
  if (startLocalDate === undefined && days === undefined) {
    return '/api/calendar';
  }
  if (startLocalDate === undefined) {
    throw new Error('Calendar start date is required.');
  }
  shiftCalendarLocalDate(startLocalDate, 0);
  if (
    days !== undefined &&
    (!Number.isSafeInteger(days) || days < 1 || days > 42)
  ) {
    throw new Error('Calendar days must be between 1 and 42.');
  }
  const parameters = new URLSearchParams({ startDate: startLocalDate });
  if (days !== undefined) parameters.set('days', String(days));
  return `/api/calendar?${parameters.toString()}`;
}
export async function getCalendarEvents(
  request: CalendarWindowRequest = {}
): Promise<CalendarData> {
  if (getAppMode() === 'demo') return { calendarUrl: '', generatedAt: new Date().toISOString(), timeZone: getHouseholdConfig().location.timezone, events: [] };
  return apiGet<CalendarData>(apiUrl(getCalendarEventsPath(request)));
}
export const CALENDAR_REFRESH_MS = getHouseholdConfig().calendar.refreshMinutes * 60 * 1000;

async function mutateAssignment(path: string, init: RequestInit): Promise<void> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const payload = await response.json() as { success?: boolean; error?: string };
  if (!response.ok || !payload.success) throw new Error(payload.error ?? 'Calendar profile assignment could not be saved.');
}

export async function setCalendarProfileAssignment(eventKey: string, target: CalendarAssignmentTarget): Promise<void> {
  if (getAppMode() === 'demo') return;
  await mutateAssignment(`/api/calendar/profile-assignments/${encodeURIComponent(eventKey)}`, {
    method: 'PUT',
    body: JSON.stringify({ target }),
  });
}

export async function clearCalendarProfileAssignment(eventKey: string): Promise<void> {
  if (getAppMode() === 'demo') return;
  await mutateAssignment(`/api/calendar/profile-assignments/${encodeURIComponent(eventKey)}`, { method: 'DELETE' });
}
