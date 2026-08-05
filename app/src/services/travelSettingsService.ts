import travelSettings from '../data/travelSettings.json';

export type TravelSettings = {
  homeAddress: string;
  leaveBufferMinutes: number;
};

export function getTravelSettings(): TravelSettings {
  return travelSettings;
}