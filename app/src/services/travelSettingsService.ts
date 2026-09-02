import {
  getHouseholdConfig,
} from './householdConfigService';

export type TravelSettings = {
  leaveBufferMinutes: number;
};

export function getTravelSettings(): TravelSettings {
  const { travel } =
    getHouseholdConfig();

  return {
    leaveBufferMinutes:
      travel.leaveBufferMinutes,
  };
}
