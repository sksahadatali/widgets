import { getHouseholdConfig } from '../config/householdConfig.js';

export async function getPrayerTimes(
  fetcher: typeof fetch = fetch,
  address = getHouseholdConfig().travel.homeAddress
) {
  const parameters = new URLSearchParams({ address, method: '15', school: '1', shafaq: 'general' });
  const response = await fetcher(`https://api.aladhan.com/v1/timingsByAddress?${parameters}`);
  if (!response.ok) throw new Error('Prayer provider request failed.');
  const value = await response.json() as { data?: { timings?: Record<string, string>; date?: { hijri?: { day?: string; month?: { en?: string }; year?: string } } } };
  const timings = value.data?.timings;
  const hijri = value.data?.date?.hijri;
  if (!timings || !hijri?.day || !hijri.month?.en || !hijri.year) throw new Error('Prayer provider response is invalid.');
  return {
    timings: { Fajr: timings.Fajr, Sunrise: timings.Sunrise, Dhuhr: timings.Dhuhr, Asr: timings.Asr, Maghrib: timings.Maghrib, Isha: timings.Isha },
    hijriDate: `${hijri.month.en} ${hijri.day}, ${hijri.year}`,
  };
}
