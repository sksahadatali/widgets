import {
  createContext,
  useContext,
} from 'react';

import {
  type DisplayProfilePreference,
  type EffectiveDisplayProfile,
  type ViewportSize,
} from './displayProfiles';

export type DisplayProfileContextValue = {
  preference: DisplayProfilePreference;
  effectiveProfile: EffectiveDisplayProfile;
  viewport: ViewportSize;
  setPreference: (
    preference: DisplayProfilePreference
  ) => void;
};

export const DisplayProfileContext =
  createContext<DisplayProfileContextValue | null>(
    null
  );

export function useDisplayProfile() {
  const context = useContext(
    DisplayProfileContext
  );

  if (!context) {
    throw new Error(
      'useDisplayProfile must be used inside DisplayProfileProvider'
    );
  }

  return context;
}
