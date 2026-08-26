import {
  createContext,
  useContext,
} from 'react';

import type {
  HouseholdProfile,
} from './householdProfiles';

export type HouseholdProfileContextValue = {
  profiles: HouseholdProfile[];
  selectedProfile: HouseholdProfile;
  selectedProfileId: string;
  isFamilySelected: boolean;
  selectProfile: (
    profileId: string
  ) => void;
  resetToFamily: () => void;
};

export const HouseholdProfileContext =
  createContext<
    HouseholdProfileContextValue | null
  >(null);

export function useHouseholdProfile() {
  const context = useContext(
    HouseholdProfileContext
  );

  if (!context) {
    throw new Error(
      'useHouseholdProfile must be used inside HouseholdProfileProvider'
    );
  }

  return context;
}
