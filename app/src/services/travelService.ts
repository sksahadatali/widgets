import type {
  CalendarEvent,
} from './calendarService';

import {
  getTravelSettings,
} from './settingsService';

import {
  getFallbackTravelTime,
} from './routeService';

export interface TravelRecommendation {
  title: string;
  location: string;
  meetingTime: Date;
  leaveTime: Date;
  travelMinutes: number;
  minutesUntilLeave: number;
}

const MAX_ADVANCE_MINUTES = 360;
const MAX_OVERDUE_MINUTES = -60;

export function getTravelRecommendation(
  calendarEvents: CalendarEvent[],
  now: Date = new Date()
): TravelRecommendation | null {

  const settings =
    getTravelSettings();

  const nextEvent =
    calendarEvents
      .filter(event => !event.allDay)
      .filter(
        event =>
          new Date(event.start) > now
      )
      .sort(
        (a, b) =>
          new Date(a.start).getTime() -
          new Date(b.start).getTime()
      )[0];

  if (
    !nextEvent ||
    !nextEvent.location
  ) {
    return null;
  }

  const travelMinutes =
    getFallbackTravelTime(
      nextEvent.location
    );

  if (travelMinutes === null) {
    return null;
  }

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
      1000
    );

  const minutesUntilLeave =
    Math.round(
      (
        leaveTime.getTime() -
        now.getTime()
      ) /
      (1000 * 60)
    );

  if (
    minutesUntilLeave < MAX_OVERDUE_MINUTES ||
    minutesUntilLeave > MAX_ADVANCE_MINUTES
  ) {
    return null;
  }

  return {
    title: nextEvent.title,
    location: nextEvent.location,
    meetingTime,
    leaveTime,
    travelMinutes,
    minutesUntilLeave,
  };
}