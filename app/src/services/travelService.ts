import type {
  CalendarEvent,
} from './calendarService';

import {
  getTravelSettings,
} from './travelSettingsService';

import {
  getCachedTravelInfo,
} from './googleMapsService';

export interface TravelRecommendation {
  title: string;
  location: string;
  meetingTime: Date;
  leaveTime: Date;
  travelMinutes: number;
  minutesUntilLeave: number;

  trafficLevel: 'light' | 'moderate' | 'heavy';
  arrivalBufferMinutes: number;
  urgency: 'normal' | 'leave-soon' | 'leave-now';
}

const MAX_ADVANCE_MINUTES = 360;
const MAX_OVERDUE_MINUTES = -60;

function findNextTravelEvent(
  events: CalendarEvent[],
  now: Date,
): CalendarEvent | null {

  return (
    events
      .filter(event => !event.allDay)
      .filter(event => !!event.location)
      .filter(
        event =>
          new Date(event.start) > now,
      )
      .sort(
        (a, b) =>
          new Date(a.start).getTime() -
          new Date(b.start).getTime(),
      )[0] ?? null
  );
}

export function getTravelRecommendation(
  calendarEvents: CalendarEvent[],
  now: Date = new Date(),
): TravelRecommendation | null {

  const settings =
    getTravelSettings();

  const nextEvent =
    findNextTravelEvent(
      calendarEvents,
      now,
    );

  if (!nextEvent) {
    return null;
  }

  const route =
    getCachedTravelInfo();

  if (!route) {
    return null;
  }

  const travelMinutes =
    route.travelMinutes;

  const meetingTime =
    new Date(nextEvent.start);

  const leaveTime =
    new Date(
      meetingTime.getTime() -
      (
        travelMinutes +
        settings.leaveBufferMinutes
      ) *
      60 *
      1000,
    );

  const minutesUntilLeave =
    Math.round(
      (
        leaveTime.getTime() -
        now.getTime()
      ) /
      (1000 * 60),
    );

  if (
    minutesUntilLeave < MAX_OVERDUE_MINUTES ||
    minutesUntilLeave > MAX_ADVANCE_MINUTES
  ) {
    return null;
  }

  const arrivalBufferMinutes =
    settings.leaveBufferMinutes;

  let urgency:
    | 'normal'
    | 'leave-soon'
    | 'leave-now';

  if (minutesUntilLeave <= 0) {
    urgency = 'leave-now';
  } else if (minutesUntilLeave <= 15) {
    urgency = 'leave-soon';
  } else {
    urgency = 'normal';
  }

  // Temporary placeholder.
  // Later this will come directly from Google Maps.
  const trafficLevel: 'light' | 'moderate' | 'heavy' =
    'light';

  return {
    title: nextEvent.title,
    location: nextEvent.location!,
    meetingTime,
    leaveTime,
    travelMinutes,
    minutesUntilLeave,

    trafficLevel,
    arrivalBufferMinutes,
    urgency,
  };
}