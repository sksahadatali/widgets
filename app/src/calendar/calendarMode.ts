import type {
  AppMode,
} from '../services/householdConfigService';

export function shouldFetchHouseholdCalendar(
  mode: AppMode
): boolean {
  return mode === 'household';
}
