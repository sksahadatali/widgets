import selectedConfig from '@household-config';

export type AppMode =
  | 'household'
  | 'demo';

export type HouseholdDestination = {
  id: string;
  name: string;
  aliases: string[];
  travelMinutes: number;
};

export type HouseholdMemberType =
  | 'adult'
  | 'child';

export type HouseholdMember = {
  id: string;
  displayName: string;
  memberType: HouseholdMemberType;
};

export type HouseholdConfig = {
  household: {
    displayName: string;
    members: HouseholdMember[];
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
    !config.household?.displayName ||
    !Array.isArray(
      config.household.members
    ) ||
    config.household.members.length === 0
  ) {
    throw new Error(
      'Household member profiles are not configured.'
    );
  }

  const memberIds = new Set<string>();

  config.household.members.forEach(
    (member, index) => {
      const memberId =
        member.id?.trim();

      if (
        !memberId ||
        memberId === 'family' ||
        memberIds.has(memberId) ||
        !member.displayName?.trim() ||
        (
          member.memberType !== 'adult' &&
          member.memberType !== 'child'
        )
      ) {
        throw new Error(
          `Household member profile ${index + 1} is invalid.`
        );
      }

      memberIds.add(memberId);
    }
  );

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
