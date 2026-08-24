import {
  getHouseholdConfig,
} from '../services/householdConfigService';

export interface Destination {
  id: string;
  name: string;
  aliases: string[];
  travelMinutes: number;
}

export function findDestination(
  location: string
): Destination | undefined {

  const value =
    location.trim().toLowerCase();

  const destinations =
    getHouseholdConfig()
      .travel.destinations;

  return destinations
    .find(destination =>
      destination.name.toLowerCase() === value ||
      destination.aliases.some(
        alias =>
          alias.toLowerCase() === value
      )
    );
}

export function calculateLeaveTime(
  meetingTime: Date,
  travelMinutes: number,
  bufferMinutes = 10
): Date {

  return new Date(
    meetingTime.getTime() -
      (
        travelMinutes +
        bufferMinutes
      ) *
      60 *
      1000
  );
}
