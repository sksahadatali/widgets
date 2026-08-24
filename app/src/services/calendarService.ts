import { apiGet } from './apiClient';

import {
  getAppMode,
  getHouseholdConfig,
} from './householdConfigService';

const CALENDAR_CONFIG =
  getHouseholdConfig().calendar;

type CalendarApiEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  location?: string;
  description?: string;
  status?: string;
  calendarUrl?: string;
};

type CalendarApiResponse = {
  success: boolean;
  calendarUrl?: string;
  generatedAt?: string;
  timeZone?: string;
  events?: CalendarApiEvent[];
  error?: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  description: string;
  calendarUrl: string;
};

export type CalendarData = {
  calendarUrl: string;
  generatedAt: string;
  timeZone: string;
  events: CalendarEvent[];
};

export async function getCalendarEvents(): Promise<CalendarData> {
  if (
    getAppMode() === 'demo' &&
    !CALENDAR_CONFIG.endpoint
  ) {
    return {
      calendarUrl:
        'https://calendar.google.com/calendar/u/0/r',
      generatedAt:
        new Date().toISOString(),
      timeZone:
        getHouseholdConfig()
          .location.timezone,
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

  const events = (data.events ?? []).map(
    event => ({
      id: event.id,
      title:
        event.title ||
        'Untitled event',
      start: event.start,
      end: event.end,
      allDay:
        event.allDay ?? false,
      location:
        event.location ?? '',
      description:
        event.description ?? '',
      calendarUrl:
        event.calendarUrl ||
        data.calendarUrl ||
        'https://calendar.google.com/calendar/u/0/r',
    })
  );

  return {
    calendarUrl:
      data.calendarUrl ||
      'https://calendar.google.com/calendar/u/0/r',
    generatedAt:
      data.generatedAt ?? '',
    timeZone:
      data.timeZone ||
      getHouseholdConfig()
        .location.timezone,
    events,
  };
}

export const CALENDAR_REFRESH_MS =
  CALENDAR_CONFIG.refreshMinutes *
  60 *
  1000;
