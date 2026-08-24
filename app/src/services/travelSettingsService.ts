import {
  getHouseholdConfig,
} from './householdConfigService';

export type TravelSettings = {
  homeAddress: string;
  leaveBufferMinutes: number;
};

export function getTravelSettings(): TravelSettings {
  const { travel } =
    getHouseholdConfig();

  return {
    homeAddress:
      travel.homeAddress,
    leaveBufferMinutes:
      travel.leaveBufferMinutes,
  };
}
