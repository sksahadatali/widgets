import type { WeatherData } from './weatherService';
import type { PrayerData } from './prayerService';
import type { CalendarData } from './calendarService';
import type { NestStatus } from './nestService';

export type BriefData = {
  heading: string;
  items: string[];
  updatedAt: string;
};

type BriefInput = {
  weather: WeatherData | null;
  prayer: PrayerData | null;
  calendar: CalendarData | null;
  nest: NestStatus | null;
};

type BriefItem = {
  text: string;
  priority: number;
};

const RAIN_CODES = [
  51,
  53,
  55,
  61,
  63,
  65,
  80,
  81,
  95,
];

function getPrayerMinutesRemaining(
  timeRemaining: string
): number | null {
  const hourMatch =
    timeRemaining.match(/(\d+)h/);

  const minuteMatch =
    timeRemaining.match(/(\d+)m/);

  if (!hourMatch && !minuteMatch) {
    return null;
  }

  const hours =
    hourMatch
      ? Number.parseInt(hourMatch[1], 10)
      : 0;

  const minutes =
    minuteMatch
      ? Number.parseInt(minuteMatch[1], 10)
      : 0;

  return hours * 60 + minutes;
}

function getPrayerItem(
  prayer: PrayerData
): BriefItem {
  const minutesRemaining =
    getPrayerMinutesRemaining(
      prayer.timeRemaining
    );

  if (
    minutesRemaining !== null &&
    minutesRemaining <= 30
  ) {
    return {
      text:
        `${prayer.name} is in ${minutesRemaining} minutes ` +
        `at ${prayer.time}.`,
      priority: 100,
    };
  }

  if (
    minutesRemaining !== null &&
    minutesRemaining <= 60
  ) {
    return {
      text:
        `${prayer.name} is coming up in ${minutesRemaining} minutes ` +
        `at ${prayer.time}.`,
      priority: 90,
    };
  }

  return {
    text:
      `Next prayer is ${prayer.name} at ${prayer.time} ` +
      `(${prayer.timeRemaining.toLowerCase()}).`,
    priority: 40,
  };
}

function getCalendarItem(
  calendar: CalendarData
): BriefItem | null {
  const noEvents =
    calendar.title
      .trim()
      .toLowerCase() === 'no events';

  if (noEvents) {
    return null;
  }

  if (calendar.time) {
    return {
      text:
        `Next calendar event is ${calendar.title} ` +
        `at ${calendar.time}.`,
      priority: 95,
    };
  }

  return {
    text:
      `Next calendar event is ${calendar.title}.`,
    priority: 95,
  };
}

function getWeatherItem(
  weather: WeatherData
): BriefItem {
  if (
    RAIN_CODES.includes(
      weather.weatherCode
    )
  ) {
    return {
      text:
        `${weather.condition} expected in ${weather.location}. ` +
        `High ${weather.high}°C, low ${weather.low}°C.`,
      priority: 85,
    };
  }

  if (weather.high >= 28) {
    return {
      text:
        `A hot day is expected, reaching ${weather.high}°C ` +
        `in ${weather.location}.`,
      priority: 80,
    };
  }

  if (weather.low <= 3) {
    return {
      text:
        `It will be cold today, with temperatures falling ` +
        `to ${weather.low}°C.`,
      priority: 80,
    };
  }

  return {
    text:
      `${weather.condition} today, with a high of ` +
      `${weather.high}°C.`,
    priority: 20,
  };
}

function getNestItem(
  nest: NestStatus
): BriefItem | null {
  if (!nest.online) {
    return {
      text:
        'Nest thermostat is offline and may need attention.',
      priority: 100,
    };
  }

  if (
    nest.temperatureCelsius === null
  ) {
    return null;
  }

  const temperature =
    nest.temperatureCelsius.toFixed(1);

  if (nest.heating) {
    return {
      text:
        `Heating is currently on. ` +
        `Indoor temperature is ${temperature}°C.`,
      priority: 75,
    };
  }

  if (
    nest.temperatureCelsius >= 25
  ) {
    return {
      text:
        `Home is slightly warm at ${temperature}°C; ` +
        `heating is off.`,
      priority: 65,
    };
  }

  if (
    nest.temperatureCelsius <= 17
  ) {
    return {
      text:
        `Home is cool at ${temperature}°C.`,
      priority: 65,
    };
  }

  return null;
}

function getHeading(
  input: BriefInput
): string {
  const prayerMinutes =
    input.prayer
      ? getPrayerMinutesRemaining(
          input.prayer.timeRemaining
        )
      : null;

  if (
    input.nest &&
    !input.nest.online
  ) {
    return 'Your home needs attention.';
  }

  if (
    prayerMinutes !== null &&
    prayerMinutes <= 30 &&
    input.prayer
  ) {
    return `${input.prayer.name} is coming up soon.`;
  }

  if (
    input.calendar &&
    input.calendar.title
      .trim()
      .toLowerCase() !== 'no events'
  ) {
    return 'You have something coming up.';
  }

  if (
    input.weather &&
    RAIN_CODES.includes(
      input.weather.weatherCode
    )
  ) {
    return 'Plan for wet weather today.';
  }

  if (
    input.weather &&
    input.weather.high >= 28
  ) {
    return 'It is going to be a hot day.';
  }

  const hour =
    new Date().getHours();

  if (hour < 12) {
    return 'A clear start to your day.';
  }

  if (hour < 17) {
    return 'Your afternoon is looking clear.';
  }

  return 'A quiet evening ahead.';
}

export function buildTodaysBrief(
  input: BriefInput
): BriefData {
  const candidates: BriefItem[] = [];

  if (input.prayer) {
    candidates.push(
      getPrayerItem(input.prayer)
    );
  }

  if (input.calendar) {
    const calendarItem =
      getCalendarItem(
        input.calendar
      );

    if (calendarItem) {
      candidates.push(calendarItem);
    }
  }

  if (input.weather) {
    candidates.push(
      getWeatherItem(input.weather)
    );
  }

  if (input.nest) {
    const nestItem =
      getNestItem(input.nest);

    if (nestItem) {
      candidates.push(nestItem);
    }
  }

  candidates.sort(
    (a, b) =>
      b.priority - a.priority
  );

  /*
   * Prefer meaningful information.
   * Low-priority weather/prayer items are used
   * only when the brief would otherwise be sparse.
   */
  let selected =
    candidates.filter(
      item => item.priority >= 60
    );

  if (selected.length < 2) {
    const fallbackItems =
      candidates.filter(
        item => item.priority < 60
      );

    selected = [
      ...selected,
      ...fallbackItems,
    ];
  }

  const items =
    selected
      .slice(0, 3)
      .map(item => item.text);

  /*
   * When nothing needs attention, provide
   * one useful reassurance about the calendar.
   */
  if (
    items.length < 3 &&
    input.calendar &&
    input.calendar.title
      .trim()
      .toLowerCase() === 'no events'
  ) {
    items.push(
      input.calendar.meta
        ? `No upcoming calendar commitments — ${input.calendar.meta.toLowerCase()}.`
        : 'No upcoming calendar commitments.'
    );
  }

  return {
    heading: getHeading(input),
    items,

    updatedAt:
      new Date().toLocaleTimeString(
        'en-GB',
        {
          hour: '2-digit',
          minute: '2-digit',
        }
      ),
  };
}