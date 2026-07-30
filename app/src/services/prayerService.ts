import { apiGet } from './apiClient';

const PRAYER_CONFIG = {
  latitude: 51.9172,
  longitude: -0.6603,
  method: 2,
  school: 1,
  timezone: 'Europe/London',
  refreshMinutes: 60,
};

type PrayerName =
  | 'Fajr'
  | 'Dhuhr'
  | 'Asr'
  | 'Maghrib'
  | 'Isha';

type PrayerTimings = {
  Fajr: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
};

type AladhanResponse = {
  data: {
    timings: PrayerTimings;
  };
};

export type PrayerData = {
  name: PrayerName;

  // Display time (HH:mm)
  time: string;

  // ISO date/time for Today's Brain
  dateTime: string;

  // Machine-readable countdown
  minutesRemaining: number;

  // Convenience flags
  isDueSoon: boolean;
  isCurrentPrayer: boolean;

  // Human-readable countdown
  timeRemaining: string;
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
  displayTime: string
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

    // Reserved for future use
    isCurrentPrayer:
      minutesRemaining === 0,

    timeRemaining:
      getTimeRemaining(
        prayerTime
      ),
  };
}

function findNextPrayer(
  timings: PrayerTimings
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
        )
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
    )
  );
}

export async function getNextPrayer(): Promise<PrayerData> {
  const url =
    'https://api.aladhan.com/v1/timings' +
    `?latitude=${PRAYER_CONFIG.latitude}` +
    `&longitude=${PRAYER_CONFIG.longitude}` +
    `&method=${PRAYER_CONFIG.method}` +
    `&school=${PRAYER_CONFIG.school}`;

  const data =
    await apiGet<AladhanResponse>(
      url
    );

  return findNextPrayer(
    data.data.timings
  );
}

export const PRAYER_REFRESH_MS =
  PRAYER_CONFIG.refreshMinutes *
  60 *
  1000;