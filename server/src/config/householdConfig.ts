import { access, readFile, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join, relative } from 'node:path';

import type { RuntimeAppMode } from './runtimeData.js';

export const RUNTIME_CONFIG_DIRECTORY = 'config';
export const HOUSEHOLD_CONFIG_FILE = 'household.json';

const SCHOOL_KINDS = new Set([
  'school.training-day',
  'school.holiday',
  'school.reopens',
]);
const MEMBER_TYPES = new Set(['adult', 'child']);
const SOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

export type HouseholdMember = {
  id: string;
  displayName: string;
  memberType: 'adult' | 'child';
};

export type CalendarSourceConfig = {
  sourceId: string;
  label: string;
  kind: string;
  calendarId?: string;
  calendarName?: string;
};

export type CalendarSemanticRule = {
  sourceId: string;
  kind: 'school.training-day' | 'school.holiday' | 'school.reopens';
  titleEquals?: string;
  titleIncludes?: string;
  label?: string;
};

export type HouseholdConfig = {
  schemaVersion: 1;
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
    destinations: Array<{
      id: string;
      name: string;
      aliases: string[];
      travelMinutes: number;
    }>;
  };
  calendar: {
    endpoint: string;
    refreshMinutes: number;
    presentationUrl?: string;
    sources: CalendarSourceConfig[];
    semanticRules: CalendarSemanticRule[];
  };
};

export type LegacyHouseholdConfig = Omit<HouseholdConfig, 'schemaVersion'>;

export type ClientHouseholdConfig = {
  schemaVersion: 1;
  appMode: 'household';
  household: HouseholdConfig['household'];
  location: { timezone: string };
  travel: { leaveBufferMinutes: number };
  calendar: { refreshMinutes: number };
};

let activeConfig: HouseholdConfig | null = null;
let activeMode: RuntimeAppMode = 'demo';

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string
): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some(key => !allowedSet.has(key))) {
    throw new Error(`${path} contains an unknown field.`);
  }
}

function text(
  value: unknown,
  path: string,
  max = 300
): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new Error(`${path} is invalid.`);
  }
  return value.trim();
}

function integer(
  value: unknown,
  path: string,
  min: number,
  max: number
): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new Error(`${path} is invalid.`);
  }
  return Number(value);
}

function numberInRange(
  value: unknown,
  path: string,
  min: number,
  max: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${path} is invalid.`);
  }
  return value;
}

function validateTimeZone(value: unknown): string {
  const timeZone = text(value, 'location.timezone', 100);
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone }).format();
  } catch {
    throw new Error('location.timezone is invalid.');
  }
  return timeZone;
}

function validateMembers(value: unknown): HouseholdMember[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) {
    throw new Error('household.members is invalid.');
  }
  const ids = new Set<string>();
  return value.map((item, index) => {
    const member = object(item, `household.members[${index}]`);
    exactKeys(member, ['id', 'displayName', 'memberType'], `household.members[${index}]`);
    const id = text(member.id, `household.members[${index}].id`, 80);
    const memberType = text(member.memberType, `household.members[${index}].memberType`, 20);
    if (id === 'family' || ids.has(id) || !MEMBER_TYPES.has(memberType)) {
      throw new Error(`household.members[${index}] is invalid.`);
    }
    ids.add(id);
    return {
      id,
      displayName: text(member.displayName, `household.members[${index}].displayName`, 100),
      memberType: memberType as HouseholdMember['memberType'],
    };
  });
}

function validateSources(value: unknown): CalendarSourceConfig[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new Error('calendar.sources is invalid.');
  }
  const ids = new Set<string>();
  return value.map((item, index) => {
    const source = object(item, `calendar.sources[${index}]`);
    exactKeys(source, ['sourceId', 'label', 'kind', 'calendarId', 'calendarName'], `calendar.sources[${index}]`);
    const sourceId = text(source.sourceId, `calendar.sources[${index}].sourceId`, 80);
    const calendarId = source.calendarId === undefined ? undefined : text(source.calendarId, `calendar.sources[${index}].calendarId`, 300);
    const calendarName = source.calendarName === undefined ? undefined : text(source.calendarName, `calendar.sources[${index}].calendarName`, 200);
    if (!SOURCE_ID_PATTERN.test(sourceId) || ids.has(sourceId) || (!calendarId && !calendarName)) {
      throw new Error(`calendar.sources[${index}] is invalid.`);
    }
    ids.add(sourceId);
    return {
      sourceId,
      label: text(source.label, `calendar.sources[${index}].label`, 80),
      kind: text(source.kind, `calendar.sources[${index}].kind`, 80),
      ...(calendarId ? { calendarId } : {}),
      ...(calendarName ? { calendarName } : {}),
    };
  });
}

function validateRules(
  value: unknown,
  sources: readonly CalendarSourceConfig[]
): CalendarSemanticRule[] {
  if (!Array.isArray(value) || value.length > 200) {
    throw new Error('calendar.semanticRules is invalid.');
  }
  const schoolIds = new Set(sources.filter(source => source.kind === 'school').map(source => source.sourceId));
  const definitions = new Set<string>();
  return value.map((item, index) => {
    const rule = object(item, `calendar.semanticRules[${index}]`);
    exactKeys(rule, ['sourceId', 'kind', 'titleEquals', 'titleIncludes', 'label'], `calendar.semanticRules[${index}]`);
    const sourceId = text(rule.sourceId, `calendar.semanticRules[${index}].sourceId`, 80);
    const kind = text(rule.kind, `calendar.semanticRules[${index}].kind`, 80);
    const titleEquals = rule.titleEquals === undefined ? undefined : text(rule.titleEquals, `calendar.semanticRules[${index}].titleEquals`, 200);
    const titleIncludes = rule.titleIncludes === undefined ? undefined : text(rule.titleIncludes, `calendar.semanticRules[${index}].titleIncludes`, 200);
    if (!schoolIds.has(sourceId) || !SCHOOL_KINDS.has(kind) || Boolean(titleEquals) === Boolean(titleIncludes) || (titleIncludes?.length ?? 3) < 3) {
      throw new Error(`calendar.semanticRules[${index}] is invalid.`);
    }
    const definition = `${sourceId}\0${titleEquals ? 'equals' : 'includes'}\0${(titleEquals ?? titleIncludes)!.toLocaleLowerCase('en-GB')}`;
    if (definitions.has(definition)) {
      throw new Error(`calendar.semanticRules[${index}] is duplicated.`);
    }
    definitions.add(definition);
    const label = rule.label === undefined ? undefined : text(rule.label, `calendar.semanticRules[${index}].label`, 80);
    return {
      sourceId,
      kind: kind as CalendarSemanticRule['kind'],
      ...(titleEquals ? { titleEquals } : {}),
      ...(titleIncludes ? { titleIncludes } : {}),
      ...(label ? { label } : {}),
    };
  });
}

export function validateHouseholdConfig(value: unknown): HouseholdConfig {
  const root = object(value, 'configuration');
  exactKeys(root, ['schemaVersion', 'household', 'location', 'travel', 'calendar'], 'configuration');
  if (root.schemaVersion !== 1) {
    throw new Error('configuration.schemaVersion is unsupported.');
  }
  const household = object(root.household, 'household');
  exactKeys(household, ['displayName', 'members'], 'household');
  const location = object(root.location, 'location');
  exactKeys(location, ['name', 'latitude', 'longitude', 'timezone'], 'location');
  const travel = object(root.travel, 'travel');
  exactKeys(travel, ['homeAddress', 'leaveBufferMinutes', 'destinations'], 'travel');
  const destinationsValue = travel.destinations;
  if (!Array.isArray(destinationsValue) || destinationsValue.length > 100) {
    throw new Error('travel.destinations is invalid.');
  }
  const destinationIds = new Set<string>();
  const destinations = destinationsValue.map((item, index) => {
    const destination = object(item, `travel.destinations[${index}]`);
    exactKeys(destination, ['id', 'name', 'aliases', 'travelMinutes'], `travel.destinations[${index}]`);
    const id = text(destination.id, `travel.destinations[${index}].id`, 80);
    if (destinationIds.has(id) || !Array.isArray(destination.aliases) || destination.aliases.length > 50) {
      throw new Error(`travel.destinations[${index}] is invalid.`);
    }
    destinationIds.add(id);
    return {
      id,
      name: text(destination.name, `travel.destinations[${index}].name`, 150),
      aliases: destination.aliases.map((alias, aliasIndex) => text(alias, `travel.destinations[${index}].aliases[${aliasIndex}]`, 150)),
      travelMinutes: integer(destination.travelMinutes, `travel.destinations[${index}].travelMinutes`, 0, 1440),
    };
  });
  const calendar = object(root.calendar, 'calendar');
  exactKeys(calendar, ['endpoint', 'refreshMinutes', 'presentationUrl', 'sources', 'semanticRules'], 'calendar');
  const endpoint = text(calendar.endpoint, 'calendar.endpoint', 2000);
  let endpointUrl: URL;
  try { endpointUrl = new URL(endpoint); } catch { throw new Error('calendar.endpoint is invalid.'); }
  if (endpointUrl.protocol !== 'https:') throw new Error('calendar.endpoint must use HTTPS.');
  const presentationUrl = calendar.presentationUrl === undefined ? undefined : text(calendar.presentationUrl, 'calendar.presentationUrl', 2000);
  if (presentationUrl) {
    let parsed: URL;
    try { parsed = new URL(presentationUrl); } catch { throw new Error('calendar.presentationUrl is invalid.'); }
    if (parsed.protocol !== 'https:') throw new Error('calendar.presentationUrl must use HTTPS.');
  }
  const sources = validateSources(calendar.sources);
  return {
    schemaVersion: 1,
    household: {
      displayName: text(household.displayName, 'household.displayName', 100),
      members: validateMembers(household.members),
    },
    location: {
      name: text(location.name, 'location.name', 150),
      latitude: numberInRange(location.latitude, 'location.latitude', -90, 90),
      longitude: numberInRange(location.longitude, 'location.longitude', -180, 180),
      timezone: validateTimeZone(location.timezone),
    },
    travel: {
      homeAddress: text(travel.homeAddress, 'travel.homeAddress', 500),
      leaveBufferMinutes: integer(travel.leaveBufferMinutes, 'travel.leaveBufferMinutes', 0, 180),
      destinations,
    },
    calendar: {
      endpoint,
      refreshMinutes: integer(calendar.refreshMinutes, 'calendar.refreshMinutes', 1, 1440),
      ...(presentationUrl ? { presentationUrl } : {}),
      sources,
      semanticRules: validateRules(calendar.semanticRules, sources),
    },
  };
}

export function validateLegacyHouseholdConfig(value: unknown): LegacyHouseholdConfig {
  const legacy = object(value, 'configuration');
  if ('schemaVersion' in legacy) {
    throw new Error('Legacy configuration must not contain schemaVersion.');
  }
  return (({ schemaVersion: _schemaVersion, ...config }) => config)(
    validateHouseholdConfig({ schemaVersion: 1, ...legacy })
  );
}

export async function loadHouseholdConfig(options: {
  appMode: RuntimeAppMode;
  rootPath: string | null;
  serverMode: 'development' | 'production';
}): Promise<void> {
  activeMode = options.appMode;
  activeConfig = null;
  if (options.appMode === 'demo') return;
  const filePath = options.rootPath
    ? join(options.rootPath, RUNTIME_CONFIG_DIRECTORY, HOUSEHOLD_CONFIG_FILE)
    : fileURLToPath(new URL('../../../app/src/config/household.local.json', import.meta.url));
  if (options.serverMode === 'production' && !options.rootPath) {
    throw new Error('Household production requires external configuration.');
  }
  if (options.rootPath) {
    const configDirectory = join(options.rootPath, RUNTIME_CONFIG_DIRECTORY);
    const [rootReal, directoryReal, fileReal] = await Promise.all([
      realpath(options.rootPath),
      realpath(configDirectory).catch(() => { throw new Error('Household configuration directory is missing.'); }),
      realpath(filePath).catch(() => { throw new Error('Household configuration is missing or malformed.'); }),
    ]);
    const withinRoot = (candidate: string) => {
      const path = relative(rootReal, candidate);
      return path === '' || (!path.startsWith('..') && !isAbsolute(path));
    };
    if (!withinRoot(directoryReal) || !withinRoot(fileReal)) {
      throw new Error('Household configuration must remain inside the external runtime root.');
    }
    const [directoryStats, fileStats] = await Promise.all([stat(directoryReal), stat(fileReal)]);
    if (!directoryStats.isDirectory() || !fileStats.isFile()) throw new Error('Household configuration path is invalid.');
    await access(fileReal, constants.R_OK).catch(() => { throw new Error('Household configuration is unreadable.'); });
  }
  let value: unknown;
  try { value = JSON.parse(await readFile(filePath, 'utf8')) as unknown; }
  catch { throw new Error('Household configuration is missing or malformed.'); }
  try {
    activeConfig = options.rootPath
      ? validateHouseholdConfig(value)
      : validateHouseholdConfig({ schemaVersion: 1, ...object(value, 'configuration') });
  } catch (error) {
    throw new Error('Household configuration is invalid.', { cause: error });
  }
}

export function setHouseholdConfigForTests(config: HouseholdConfig | null, mode: RuntimeAppMode = config ? 'household' : 'demo'): void {
  activeConfig = config;
  activeMode = mode;
}

export function getHouseholdConfig(): HouseholdConfig {
  if (activeMode !== 'household' || !activeConfig) {
    throw new Error('Household configuration is unavailable.');
  }
  return activeConfig;
}

export function getRuntimeAppMode(): RuntimeAppMode {
  return activeMode;
}

export function createClientProjection(config = getHouseholdConfig()): ClientHouseholdConfig {
  return {
    schemaVersion: 1,
    appMode: 'household',
    household: {
      displayName: config.household.displayName,
      members: config.household.members.map(member => ({
        id: member.id,
        displayName: member.displayName,
        memberType: member.memberType,
      })),
    },
    location: { timezone: config.location.timezone },
    travel: { leaveBufferMinutes: config.travel.leaveBufferMinutes },
    calendar: { refreshMinutes: config.calendar.refreshMinutes },
  };
}
