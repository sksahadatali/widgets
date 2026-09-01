import { apiGet } from './apiClient';

import { getPrayerSettings } from './prayerSettingsService';
import { apiUrl } from './clientApi';


type PrayerName =
  | 'Fajr'
  | 'Dhuhr'
  | 'Asr'
  | 'Maghrib'
  | 'Isha';

type PrayerTimings = {
  Fajr: string;
  Sunrise: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
};

type PrayerApiResponse = { timings: PrayerTimings; hijriDate: string };

export type PrayerData = {
  // Next prayer
  name: PrayerName;

  // Display time (HH:mm)
  time: string;

  // ISO date/time
  dateTime: string;

  // Countdown
  minutesRemaining: number;

  // Convenience flags
  isDueSoon: boolean;
  isCurrentPrayer: boolean;

  // Human-readable countdown
  timeRemaining: string;

  // Today's prayer timetable
  timings: PrayerTimings;

  // Hijri date
  hijriDate: string;
};

function cleanPrayerTime(
  timeText: string
): string {
  return timeText.split(' ')[0];
}

function parsePrayerTime(
  timeText: string,
  addDays = 0
): Date {
  const cleanTime =
    cleanPrayerTime(timeText);

  const [hours, minutes] =
    cleanTime
      .split(':')
      .map(Number);

  const date = new Date();

  date.setHours(
    hours,
    minutes,
    0,
    0
  );

  if (addDays > 0) {
    date.setDate(
      date.getDate() + addDays
    );
  }

  return date;
}

function getMinutesRemaining(
  prayerTime: Date
): number {
  const diffMs =
    prayerTime.getTime() -
    Date.now();

  return Math.max(
    0,
    Math.round(diffMs / 60000)
  );
}

function getTimeRemaining(
  prayerTime: Date
): string {
  const totalMinutes =
    getMinutesRemaining(
      prayerTime
    );

  const hours =
    Math.floor(
      totalMinutes / 60
    );

  const minutes =
    totalMinutes % 60;

  if (hours > 0) {
    return `In ${hours}h ${minutes}m`;
  }

  return `In ${minutes}m`;
}

function buildPrayerData(
  name: PrayerName,
  prayerTime: Date,
  displayTime: string,
  timings: PrayerTimings,
  hijriDate: string
): PrayerData {
  const minutesRemaining =
    getMinutesRemaining(
      prayerTime
    );

  return {
    name,
  
    time: displayTime,
  
    dateTime:
      prayerTime.toISOString(),
  
    minutesRemaining,
  
    isDueSoon:
      minutesRemaining <= 30,
  
    isCurrentPrayer:
      minutesRemaining === 0,
  
    timeRemaining:
      getTimeRemaining(
        prayerTime
      ),
  
    timings,
  
    hijriDate,
  };
}

function findNextPrayer(
  timings: PrayerTimings,
  hijriDate: string
): PrayerData {
  const prayers: Array<{
    name: PrayerName;
    time: string;
  }> = [
    {
      name: 'Fajr',
      time: timings.Fajr,
    },
    {
      name: 'Dhuhr',
      time: timings.Dhuhr,
    },
    {
      name: 'Asr',
      time: timings.Asr,
    },
    {
      name: 'Maghrib',
      time: timings.Maghrib,
    },
    {
      name: 'Isha',
      time: timings.Isha,
    },
  ];

  const now =
    new Date();

  for (const prayer of prayers) {
    const prayerTime =
      parsePrayerTime(
        prayer.time
      );

    if (prayerTime > now) {
      return buildPrayerData(
        prayer.name,
        prayerTime,
        cleanPrayerTime(
          prayer.time
        ),
        timings,
        hijriDate
      );
    }
  }

  const fajrTomorrow =
    parsePrayerTime(
      timings.Fajr,
      1
    );

  return buildPrayerData(
    'Fajr',
    fajrTomorrow,
    cleanPrayerTime(
      timings.Fajr
    ),
    timings,
    hijriDate
  );
}

export async function getNextPrayer(): Promise<PrayerData> {

  const data = await apiGet<PrayerApiResponse>(apiUrl('/api/prayer-times'));

  return findNextPrayer(
    data.timings,
    data.hijriDate
  );
}

export function getPrayerRefreshMs(): number {
  return (
    getPrayerSettings().refreshMinutes *
    60 *
    1000
  );
}
