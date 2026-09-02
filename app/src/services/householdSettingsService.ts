import { apiGet } from './apiClient';
import { apiUrl } from './clientApi';
import { getAppMode } from './householdConfigService';
export type HouseholdSettingsPresentation = { homeAddress: string };
export function getHouseholdSettings(): Promise<HouseholdSettingsPresentation> {
  if (getAppMode() === 'demo') {
    return Promise.resolve({ homeAddress: 'Trafalgar Square, London, UK' });
  }
  return apiGet<HouseholdSettingsPresentation>(apiUrl('/api/config/settings/household'));
}
