import selectedConfig from '@household-config';

import type {
  CalendarSourceConfig,
} from '../calendar/calendarModel';

import {
  isValidCalendarSemanticRule,
  type CalendarSemanticRule,
} from '../calendar/calendarSemantics';

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
    sources?: CalendarSourceConfig[];
    semanticRules?: CalendarSemanticRule[];
  };
};

function resolveAppMode(): AppMode {
  const configuredMode =
    import.meta.env?.VITE_EY_MODE
      ?.trim()
      .toLowerCase();

  if (
    configuredMode === 'household' ||
    configuredMode === 'demo'
  ) {
    return configuredMode;
  }

  return import.meta.env?.DEV
    ? 'household'
    : 'demo';
}

export function validateHouseholdConfig(
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

  if (
    config.calendar?.sources !== undefined &&
    !Array.isArray(config.calendar.sources)
  ) {
    throw new Error(
      'Household calendar sources must be an array.'
    );
  }

  const sourceDefinitions = new Map<string, string>();
  const schoolSourceIds = new Set<string>();

  (config.calendar?.sources ?? []).forEach(
    (source, index) => {
      const sourceId = source.sourceId?.trim();
      const label = source.label?.trim();
      const kind = source.kind?.trim();
      const calendarId = source.calendarId?.trim();
      const calendarName = source.calendarName?.trim();
      const sourceKey = sourceId ?? '';
      const existingDefinition = sourceDefinitions.get(sourceKey);
      const definition = `${label}\u0000${kind}`;

      if (
        !sourceId ||
        !label ||
        !kind ||
        (!calendarId && !calendarName) ||
        (
          existingDefinition !== undefined &&
          existingDefinition !== definition
        )
      ) {
        throw new Error(
          `Household calendar source ${index + 1} is invalid.`
        );
      }

      sourceDefinitions.set(sourceKey, definition);

      if (kind === 'school') {
        schoolSourceIds.add(sourceKey);
      }
    }
  );

  if (
    config.calendar?.semanticRules !== undefined &&
    !Array.isArray(config.calendar.semanticRules)
  ) {
    throw new Error(
      'Household calendar semantic rules must be an array.'
    );
  }

  const semanticRuleDefinitions = new Set<string>();

  (config.calendar?.semanticRules ?? []).forEach(
    (rule, index) => {
      if (!isValidCalendarSemanticRule(rule)) {
        throw new Error(
          `Household calendar semantic rule ${index + 1} is invalid.`
        );
      }

      if (!schoolSourceIds.has(rule.sourceId.trim())) {
        throw new Error(
          `Household calendar semantic rule ${index + 1} must reference a configured School source.`
        );
      }

      const matchType = rule.titleEquals
        ? 'equals'
        : 'includes';
      const matchValue = (
        rule.titleEquals ??
        rule.titleIncludes ??
        ''
      )
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('en-GB');
      const definition = [
        rule.sourceId.trim(),
        matchType,
        matchValue,
      ].join('\u0000');

      if (semanticRuleDefinitions.has(definition)) {
        throw new Error(
          `Household calendar semantic rule ${index + 1} is duplicated.`
        );
      }

      semanticRuleDefinitions.add(definition);
    }
  );
}

export const APP_MODE =
  resolveAppMode();

validateHouseholdConfig(
  selectedConfig as HouseholdConfig,
  APP_MODE
);

export function getAppMode(): AppMode {
  return APP_MODE;
}

export function getHouseholdConfig(): HouseholdConfig {
  return selectedConfig as HouseholdConfig;
}
