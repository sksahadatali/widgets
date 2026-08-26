import {
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from 'react';

import {
  getHouseholdConfig,
} from '../services/householdConfigService';
import {
  FAMILY_PROFILE_ID,
  buildHouseholdProfiles,
} from './householdProfiles';
import {
  HouseholdProfileContext,
  type HouseholdProfileContextValue,
} from './useHouseholdProfile';

type HouseholdProfileProviderProps = {
  children: ReactNode;
};

export function HouseholdProfileProvider({
  children,
}: HouseholdProfileProviderProps) {
  const profiles = useMemo(
    () =>
      buildHouseholdProfiles(
        getHouseholdConfig()
      ),
    []
  );

  const [selectedProfileId, setSelectedProfileId] =
    useState<string>(FAMILY_PROFILE_ID);

  const selectedProfile =
    profiles.find(
      profile =>
        profile.id === selectedProfileId
    ) ?? profiles[0];

  const selectProfile = useCallback(
    (profileId: string) => {
      if (
        profiles.some(
          profile =>
            profile.id === profileId
        )
      ) {
        setSelectedProfileId(profileId);
      }
    },
    [profiles]
  );

  const resetToFamily = useCallback(
    () => {
      setSelectedProfileId(
        FAMILY_PROFILE_ID
      );
    },
    []
  );

  const value =
    useMemo<HouseholdProfileContextValue>(
      () => ({
        profiles,
        selectedProfile,
        selectedProfileId:
          selectedProfile.id,
        isFamilySelected:
          selectedProfile.id ===
          FAMILY_PROFILE_ID,
        selectProfile,
        resetToFamily,
      }),
      [
        profiles,
        selectedProfile,
        selectProfile,
        resetToFamily,
      ]
    );

  return (
    <HouseholdProfileContext.Provider
      value={value}
    >
      {children}
    </HouseholdProfileContext.Provider>
  );
}
