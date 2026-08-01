import {
    createContext,
    type ReactNode,
    useEffect,
    useMemo,
    useState,
  } from 'react';
  
  import {
    AMBIENCES,
    DEFAULT_AMBIENCE,
    type AmbienceDefinition,
    type AmbienceId,
  } from './ambiences';
  
  const STORAGE_KEY =
    'ey-os-ambience';
  
  type ThemeContextValue = {
    ambienceId: AmbienceId;
    ambience: AmbienceDefinition;
    setAmbience: (
      ambienceId: AmbienceId
    ) => void;
  };
  
  export const ThemeContext =
    createContext<ThemeContextValue | null>(
      null
    );
  
  function isAmbienceId(
    value: string | null
  ): value is AmbienceId {
    return AMBIENCES.some(
      ambience =>
        ambience.id === value
    );
  }
  
  function getInitialAmbience(): AmbienceId {
    const savedAmbience =
      window.localStorage.getItem(
        STORAGE_KEY
      );
  
    return isAmbienceId(savedAmbience)
      ? savedAmbience
      : DEFAULT_AMBIENCE;
  }
  
  type ThemeProviderProps = {
    children: ReactNode;
  };
  
  export function ThemeProvider({
    children,
  }: ThemeProviderProps) {
    const [
      ambienceId,
      setAmbienceId,
    ] = useState<AmbienceId>(
      getInitialAmbience
    );
  
    const ambience =
      AMBIENCES.find(
        item =>
          item.id === ambienceId
      ) ??
      AMBIENCES[0];
  
    useEffect(() => {
      document.documentElement.dataset.ambience =
        ambienceId;
  
      document.documentElement.style.colorScheme =
        ambience.mode;
  
      window.localStorage.setItem(
        STORAGE_KEY,
        ambienceId
      );
    }, [
      ambienceId,
      ambience.mode,
    ]);
  
    const value =
      useMemo<ThemeContextValue>(
        () => ({
          ambienceId,
          ambience,
          setAmbience:
            setAmbienceId,
        }),
        [
          ambienceId,
          ambience,
        ]
      );
  
    return (
      <ThemeContext.Provider
        value={value}
      >
        {children}
      </ThemeContext.Provider>
    );
  }