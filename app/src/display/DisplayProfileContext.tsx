import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  DEFAULT_DISPLAY_PROFILE,
  type DisplayProfilePreference,
  type ViewportSize,
  isDisplayProfilePreference,
  resolveEffectiveDisplayProfile,
} from './displayProfiles';
import {
  DisplayProfileContext,
  type DisplayProfileContextValue,
} from './useDisplayProfile';

import './displayProfiles.css';

const STORAGE_KEY =
  'ey-os-display-profile';

function getViewportSize(): ViewportSize {
  return {
    width: Math.round(window.innerWidth),
    height: Math.round(window.innerHeight),
  };
}

function getTouchCapability() {
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    navigator.maxTouchPoints > 0
  );
}

function getInitialPreference():
  DisplayProfilePreference {
  const savedPreference =
    window.localStorage.getItem(STORAGE_KEY);

  return isDisplayProfilePreference(
    savedPreference
  )
    ? savedPreference
    : DEFAULT_DISPLAY_PROFILE;
}

type DisplayProfileProviderProps = {
  children: ReactNode;
};

export function DisplayProfileProvider({
  children,
}: DisplayProfileProviderProps) {
  const [preference, setPreference] =
    useState<DisplayProfilePreference>(
      getInitialPreference
    );
  const [viewport, setViewport] =
    useState<ViewportSize>(getViewportSize);
  const [touchCapable, setTouchCapable] =
    useState(getTouchCapability);

  useEffect(() => {
    const pointerQuery =
      window.matchMedia('(pointer: coarse)');

    const updateDisplaySignals = () => {
      setViewport(getViewportSize());
      setTouchCapable(getTouchCapability());
    };

    window.addEventListener(
      'resize',
      updateDisplaySignals
    );
    pointerQuery.addEventListener(
      'change',
      updateDisplaySignals
    );

    return () => {
      window.removeEventListener(
        'resize',
        updateDisplaySignals
      );
      pointerQuery.removeEventListener(
        'change',
        updateDisplaySignals
      );
    };
  }, []);

  const effectiveProfile =
    resolveEffectiveDisplayProfile(
      preference,
      viewport,
      touchCapable
    );

  useEffect(() => {
    document.documentElement.dataset.displayPreference =
      preference;
    document.documentElement.dataset.displayProfile =
      effectiveProfile;

    window.localStorage.setItem(
      STORAGE_KEY,
      preference
    );
  }, [preference, effectiveProfile]);

  const value =
    useMemo<DisplayProfileContextValue>(
      () => ({
        preference,
        effectiveProfile,
        viewport,
        setPreference,
      }),
      [
        preference,
        effectiveProfile,
        viewport,
      ]
    );

  return (
    <DisplayProfileContext.Provider
      value={value}
    >
      {children}
    </DisplayProfileContext.Provider>
  );
}
