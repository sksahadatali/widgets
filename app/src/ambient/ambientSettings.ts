import type { AppPage } from '../navigation/appRoutes';

export const AMBIENT_IDLE_TIMEOUT_MS = 2 * 60 * 1000;
export const AMBIENT_PAGE_DURATION_MS = 25 * 1000;
export const AMBIENT_SETTINGS_STORAGE_KEY = 'ey-os-ambient-rotation';
export type AmbientPage = Extract<AppPage, 'Home' | 'Calendar' | 'Daily' | 'Rewards' | 'Lists' | 'Meals'>;
export type AmbientSettings = {
  version: 1;
  enabled: boolean;
  inactivitySeconds: number;
  pageDurationSeconds: Record<AmbientPage, number>;
};

export const DEFAULT_AMBIENT_SETTINGS: AmbientSettings = {
  version: 1,
  enabled: true,
  inactivitySeconds: AMBIENT_IDLE_TIMEOUT_MS / 1000,
  pageDurationSeconds: {
    Home: 120,
    Calendar: AMBIENT_PAGE_DURATION_MS / 1000,
    Daily: AMBIENT_PAGE_DURATION_MS / 1000,
    Rewards: AMBIENT_PAGE_DURATION_MS / 1000,
    Lists: AMBIENT_PAGE_DURATION_MS / 1000,
    Meals: AMBIENT_PAGE_DURATION_MS / 1000,
  },
};

export function isValidInactivitySeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) &&
    value >= 60 && value <= 3600 && value % 60 === 0;
}

export function isValidPageDurationSeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 10 && value <= 600;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export function normalizeAmbientSettings(value: unknown): AmbientSettings {
  const saved = object(value);
  const defaults = DEFAULT_AMBIENT_SETTINGS;
  const compatible = saved.version === 1 ? saved : {};
  const durations = object(compatible.pageDurationSeconds);
  const pageDurationSeconds = { ...defaults.pageDurationSeconds };
  for (const page of Object.keys(pageDurationSeconds) as AmbientPage[]) {
    if (isValidPageDurationSeconds(durations[page])) {
      pageDurationSeconds[page] = durations[page];
    }
  }
  return {
    version: 1,
    enabled: typeof compatible.enabled === 'boolean' ? compatible.enabled : defaults.enabled,
    inactivitySeconds: isValidInactivitySeconds(compatible.inactivitySeconds)
      ? compatible.inactivitySeconds : defaults.inactivitySeconds,
    pageDurationSeconds,
  };
}

export function readAmbientSettings(storage: Pick<Storage, 'getItem'>): AmbientSettings {
  try {
    return normalizeAmbientSettings(JSON.parse(storage.getItem(AMBIENT_SETTINGS_STORAGE_KEY) ?? 'null'));
  } catch {
    return normalizeAmbientSettings(null);
  }
}

export function writeAmbientSettings(storage: Pick<Storage, 'setItem'>, settings: AmbientSettings): boolean {
  try {
    storage.setItem(AMBIENT_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeAmbientSettings(settings)));
    return true;
  } catch {
    return false;
  }
}
