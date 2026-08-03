import type {
  CalendarEvent,
} from './calendarService';

import destinations from '../data/destinations.json';
import travelSettings from '../data/travelSettings.json';

export interface TravelRecommendation {
  title: string;
  location: string;
  destination: string;
  meetingTime: Date;
  leaveTime: Date;
  travelMinutes: number;
  minutesUntilLeave: number;
}

type Destination = {
  id: string;
  name: string;
  aliases: string[];
  travelMinutes: number;
};

function findDestination(
  location: string
): Destination | null {

  const value =
    location.trim().toLowerCase();

  const destination =
    (destinations as Destination[])
      .find(item =>
        item.aliases.some(alias =>
          value.includes(
            alias.toLowerCase()
          )
        )
      );

  return destination ?? null;
}

export function getTravelRecommendation(
  calendarEvents: CalendarEvent[],
  now: Date = new Date()
): TravelRecommendation | null {

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

  const destination =
    findDestination(
      nextEvent.location
    );

  if (!destination) {
    return null;
  }

  const meetingTime =
    new Date(nextEvent.start);

  const leaveTime =
    new Date(
      meetingTime.getTime() -
      (
        destination.travelMinutes +
        travelSettings.leaveBufferMinutes
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

  // Only show travel when it becomes relevant.
  if (
    minutesUntilLeave < -60 ||
    minutesUntilLeave > 360
  ) {
    return null;
  }

  return {
    title: nextEvent.title,
    location: nextEvent.location,
    destination: destination.name,
    meetingTime,
    leaveTime,
    travelMinutes:
      destination.travelMinutes,
    minutesUntilLeave,
  };
}