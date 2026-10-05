import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  normalizeAmbientSettings,
  readAmbientSettings,
  writeAmbientSettings,
  type AmbientSettings,
} from './ambientSettings';

type AmbientSettingsContextValue = {
  settings: AmbientSettings;
  saveSettings: (settings: AmbientSettings) => void;
  storageError: boolean;
};

export const AmbientSettingsContext = createContext<AmbientSettingsContextValue | null>(null);

export function AmbientSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(() => {
    // Accessing localStorage itself can fail in restricted browser contexts.
    try { return readAmbientSettings(window.localStorage); }
    catch { return normalizeAmbientSettings(null); }
  });
  const [storageError, setStorageError] = useState(false);
  const saveSettings = useCallback((next: AmbientSettings) => {
    const validated = normalizeAmbientSettings(next);
    let persisted = false;
    try { persisted = writeAmbientSettings(window.localStorage, validated); }
    catch { /* Keep the preference usable for this session. */ }
    setStorageError(!persisted);
    setSettings(current => JSON.stringify(current) === JSON.stringify(validated) ? current : validated);
  }, []);
  const value = useMemo(() => ({ settings, saveSettings, storageError }), [settings, saveSettings, storageError]);
  return <AmbientSettingsContext.Provider value={value}>{children}</AmbientSettingsContext.Provider>;
}

export function useAmbientSettings(): AmbientSettingsContextValue {
  const context = useContext(AmbientSettingsContext);
  if (!context) throw new Error('Ambient settings require AmbientSettingsProvider.');
  return context;
}
