import { apiUrl } from './clientApi';

export type AppMode = 'household' | 'demo';
export type HouseholdMemberType = 'adult' | 'child';
export type HouseholdMember = { id: string; displayName: string; memberType: HouseholdMemberType };
export type HouseholdConfig = {
  schemaVersion: 1;
  appMode: AppMode;
  household: { displayName: string; members: HouseholdMember[] };
  location: { timezone: string };
  travel: { leaveBufferMinutes: number };
  calendar: { refreshMinutes: number };
};

const DEMO_CONFIG: HouseholdConfig = {
  schemaVersion: 1, appMode: 'demo',
  household: { displayName: 'Example Household', members: [
    { id: 'adult-1', displayName: 'Alex', memberType: 'adult' },
    { id: 'child-1', displayName: 'Sam', memberType: 'child' },
  ] },
  location: { timezone: 'Europe/London' }, travel: { leaveBufferMinutes: 10 }, calendar: { refreshMinutes: 15 },
};

function resolveAppMode(): AppMode {
  const configured = import.meta.env?.VITE_EY_MODE?.trim().toLowerCase();
  if (configured === 'household' || configured === 'demo') return configured;
  return import.meta.env?.DEV ? 'household' : 'demo';
}
export const APP_MODE = resolveAppMode();
let config: HouseholdConfig | null = APP_MODE === 'demo' ? DEMO_CONFIG : null;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
}
export function validateClientConfig(value: unknown): HouseholdConfig {
  const root = record(value);
  if (!root || !exact(root, ['schemaVersion', 'appMode', 'household', 'location', 'travel', 'calendar']) || root.schemaVersion !== 1 || root.appMode !== 'household') throw new Error('Household client configuration is invalid.');
  const household = record(root.household); const location = record(root.location); const travel = record(root.travel); const calendar = record(root.calendar);
  if (!household || !location || !travel || !calendar || !exact(household, ['displayName', 'members']) || !exact(location, ['timezone']) || !exact(travel, ['leaveBufferMinutes']) || !exact(calendar, ['refreshMinutes']) || typeof household.displayName !== 'string' || !household.displayName.trim() || !Array.isArray(household.members) || household.members.length === 0 || typeof location.timezone !== 'string' || !Number.isInteger(travel.leaveBufferMinutes) || !Number.isInteger(calendar.refreshMinutes)) throw new Error('Household client configuration is invalid.');
  const ids = new Set<string>();
  const members = household.members.map(item => {
    const member = record(item);
    if (!member || !exact(member, ['id', 'displayName', 'memberType']) || typeof member.id !== 'string' || !member.id.trim() || member.id === 'family' || ids.has(member.id) || typeof member.displayName !== 'string' || !member.displayName.trim() || (member.memberType !== 'adult' && member.memberType !== 'child')) throw new Error('Household client configuration is invalid.');
    ids.add(member.id);
    return { id: member.id, displayName: member.displayName, memberType: member.memberType } as HouseholdMember;
  });
  try { new Intl.DateTimeFormat('en-GB', { timeZone: location.timezone }).format(); } catch { throw new Error('Household client configuration is invalid.'); }
  return { schemaVersion: 1, appMode: 'household', household: { displayName: household.displayName, members }, location: { timezone: location.timezone }, travel: { leaveBufferMinutes: Number(travel.leaveBufferMinutes) }, calendar: { refreshMinutes: Number(calendar.refreshMinutes) } };
}
export async function bootstrapHouseholdConfig(): Promise<void> {
  if (APP_MODE === 'demo') return;
  const response = await fetch(apiUrl('/api/config/client'), { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Household configuration is unavailable.');
  config = validateClientConfig(await response.json());
}
export function setClientConfigForTests(value: HouseholdConfig): void { config = value; }
export function getAppMode(): AppMode { return APP_MODE; }
export function getHouseholdConfig(): HouseholdConfig { if (!config) throw new Error('Household configuration is unavailable.'); return config; }
