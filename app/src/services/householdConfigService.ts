import exampleConfig from '../config/household.example.json';

export type AppMode =
  | 'household'
  | 'demo';

export type HouseholdDestination = {
  id: string;
  name: string;
  aliases: string[];
  travelMinutes: number;
};

export type HouseholdConfig = {
  household: {
    displayName: string;
  };

  location: {
    name: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };

  travel: {
    homeAddress: string;
    leaveBufferMinutes: number;
    destinations: HouseholdDestination[];
  };

  calendar: {
    endpoint: string;
    refreshMinutes: number;
  };
};

const localConfigModules =
  import.meta.glob(
    '../config/household.local.json',
    {
      eager: true,
      import: 'default',
    }
  ) as Record<string, unknown>;

const LOCAL_CONFIG_PATH =
  '../config/household.local.json';

function resolveAppMode(): AppMode {
  const configuredMode =
    import.meta.env.VITE_EY_MODE
      ?.trim()
      .toLowerCase();

  if (
    configuredMode === 'household' ||
    configuredMode === 'demo'
  ) {
    return configuredMode;
  }

  return import.meta.env.DEV
    ? 'household'
    : 'demo';
}

function validateConfig(
  config: HouseholdConfig,
  mode: AppMode
): void {
  if (
    !config.location?.name ||
    typeof config.location.latitude !==
      'number' ||
    typeof config.location.longitude !==
      'number' ||
    !config.location.timezone
  ) {
    throw new Error(
      'Household configuration has invalid location settings.'
    );
  }

  if (
    !config.travel?.homeAddress ||
    !Array.isArray(
      config.travel.destinations
    )
  ) {
    throw new Error(
      'Household configuration has invalid travel settings.'
    );
  }

  if (
    mode === 'household' &&
    !config.calendar?.endpoint
  ) {
    throw new Error(
      'Household calendar endpoint is not configured.'
    );
  }
}

export const APP_MODE =
  resolveAppMode();

const localConfig =
  localConfigModules[
    LOCAL_CONFIG_PATH
  ] as HouseholdConfig | undefined;

if (
  APP_MODE === 'household' &&
  !localConfig
) {
  throw new Error(
    'eY OS is running in Household mode, but ' +
    'app/src/config/household.local.json is missing. ' +
    'Create it from household.example.json and add ' +
    'the real household values locally. This file ' +
    'must never be committed.'
  );
}

const selectedConfig =
  APP_MODE === 'household'
    ? localConfig
    : exampleConfig;

validateConfig(
  selectedConfig as HouseholdConfig,
  APP_MODE
);

export function getAppMode(): AppMode {
  return APP_MODE;
}

export function getHouseholdConfig(): HouseholdConfig {
  return selectedConfig as HouseholdConfig;
}
