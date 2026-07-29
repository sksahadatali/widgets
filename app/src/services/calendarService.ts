import { apiGet } from './apiClient';

const CALENDAR_CONFIG = {
  endpoint:
    'https://script.google.com/macros/s/AKfycbzAqiws7K9sdm8tIc1XnB0PlD3_lX8nMpADkLJJC4aej-kjGf1cyjukJF6RFCpL9hCtIA/exec',
  refreshMinutes: 15,
};

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
      Intl.DateTimeFormat()
        .resolvedOptions()
        .timeZone,
    events,
  };
}

export const CALENDAR_REFRESH_MS =
  CALENDAR_CONFIG.refreshMinutes *
  60 *
  1000;
