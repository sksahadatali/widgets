import prayerSettings from '../data/prayerSettings.json';

export type PrayerSettings = {
  provider: string;
  calculationMethod: number;
  calculationMethodName: string;
  school: number;
  schoolName: string;
  shafaq: string;
  refreshMinutes: number;
};

export function getPrayerSettings(): PrayerSettings {
  return prayerSettings;
}