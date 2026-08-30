import { apiGet } from './apiClient';

import {
  shouldFetchHouseholdCalendar,
} from '../calendar/calendarMode';

import {
  normalizeCalendarEvent,
  type CalendarApiEvent,
  type CalendarEvent,
} from '../calendar/calendarModel';

import {
  getAppMode,
  getHouseholdConfig,
} from './householdConfigService';

const CALENDAR_CONFIG =
  getHouseholdConfig().calendar;

const DEFAULT_CALENDAR_URL =
  'https://calendar.google.com/calendar/u/0/r';

type CalendarApiResponse = {
  success: boolean;
  calendarUrl?: string;
  generatedAt?: string;
  timeZone?: string;
  events?: CalendarApiEvent[];
  error?: string;
};

export type { CalendarEvent };

export type CalendarData = {
  calendarUrl: string;
  generatedAt: string;
  timeZone: string;
  events: CalendarEvent[];
};

export async function getCalendarEvents(): Promise<CalendarData> {
  if (!shouldFetchHouseholdCalendar(getAppMode())) {
    return {
      calendarUrl: DEFAULT_CALENDAR_URL,
      generatedAt: new Date().toISOString(),
      timeZone: getHouseholdConfig().location.timezone,
      events: [],
    };
  }

  const data =
    await apiGet<CalendarApiResponse>(
      CALENDAR_CONFIG.endpoint
    );

  if (!data.success) {
    throw new Error(
      data.error ||
        'Calendar API returned an unsuccessful response'
    );
  }

  const calendarUrl =
    data.calendarUrl || DEFAULT_CALENDAR_URL;
  const timeZone =
    data.timeZone || getHouseholdConfig().location.timezone;
  const events = (data.events ?? [])
    .map(event => normalizeCalendarEvent(
      event,
      timeZone,
      CALENDAR_CONFIG.sources ?? [],
      calendarUrl
    ))
    .filter((event): event is CalendarEvent => event !== null);

  return {
    calendarUrl,
    generatedAt: data.generatedAt ?? '',
    timeZone,
    events,
  };
}

export const CALENDAR_REFRESH_MS =
  CALENDAR_CONFIG.refreshMinutes *
  60 *
  1000;
