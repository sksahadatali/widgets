import type { WeatherData } from './weatherService';
import type { PrayerData } from './prayerService';
import type { CalendarEvent } from './calendarService';
import type { NestStatus } from './nestService';

import {
  getTravelRecommendation,
} from './travelService';

import {
  getPrimaryWeatherInsight,
} from './weatherIntelligence';

export type BriefData = {
  heading: string;
  items: string[];
  updatedAt: string;
};

type BriefInput = {
  weather: WeatherData | null;
  prayer: PrayerData | null;
  todayEvents: CalendarEvent[];
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
      ? Number.parseInt(
          hourMatch[1],
          10
        )
      : 0;

  const minutes =
    minuteMatch
      ? Number.parseInt(
          minuteMatch[1],
          10
        )
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

function getEventTime(
  event: CalendarEvent
): string | null {
  if (event.allDay) {
    return null;
  }

  const startDate =
    new Date(event.start);

  if (
    Number.isNaN(
      startDate.getTime()
    )
  ) {
    return null;
  }

  return startDate.toLocaleTimeString(
    'en-GB',
    {
      hour: '2-digit',
      minute: '2-digit',
    }
  );
}

function getNextRelevantEvent(
  events: CalendarEvent[]
): CalendarEvent | null {
  if (events.length === 0) {
    return null;
  }

  const now =
    new Date().getTime();

  const sortedEvents =
    [...events].sort(
      (first, second) =>
        new Date(
          first.start
        ).getTime() -
        new Date(
          second.start
        ).getTime()
    );

  const upcomingEvent =
    sortedEvents.find(event => {
      const eventEnd =
        new Date(event.end)
          .getTime();

      return (
        !Number.isNaN(eventEnd) &&
        eventEnd >= now
      );
    });

  return (
    upcomingEvent ??
    sortedEvents[0] ??
    null
  );
}

function getCalendarItem(
  todayEvents: CalendarEvent[]
): BriefItem | null {
  const event =
    getNextRelevantEvent(
      todayEvents
    );

  if (!event) {
    return null;
  }

  if (event.allDay) {
    return {
      text:
        `${event.title} is scheduled for today.`,
      priority: 95,
    };
  }

  const eventTime =
    getEventTime(event);

  if (eventTime) {
    return {
      text:
        `${event.title} starts at ${eventTime}.`,
      priority: 95,
    };
  }

  return {
    text:
      `${event.title} is scheduled for today.`,
    priority: 95,
  };
}

function getWeatherItem(
  weather: WeatherData
): BriefItem | null {
  const insight =
    getPrimaryWeatherInsight(
      weather
    );

  if (!insight) {
    return null;
  }

  return {
    text:
      `${insight.message} ${insight.action}`,
    priority: insight.score,
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
    nest.temperatureCelsius ===
    null
  ) {
    return null;
  }

  const temperature =
    nest.temperatureCelsius
      .toFixed(1);

  if (nest.heating) {
    return {
      text:
        `Heating is currently on. ` +
        `Indoor temperature is ${temperature}°C.`,
      priority: 75,
    };
  }

  if (
    nest.temperatureCelsius >=
    25
  ) {
    return {
      text:
        `Home is slightly warm at ${temperature}°C; ` +
        `heating is off.`,
      priority: 65,
    };
  }

  if (
    nest.temperatureCelsius <=
    17
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
          input.prayer
            .timeRemaining
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
    getNextRelevantEvent(
      input.todayEvents
    )
  ) {
    return 'You have something coming up.';
  }

  /*
   * Heading still uses the existing weather checks.
   * This will move into weatherIntelligence.ts
   * during the next refinement.
   */
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

function getTravelItem(
  todayEvents: CalendarEvent[]
): BriefItem | null {

  const recommendation =
    getTravelRecommendation(
      todayEvents
    );

  if (!recommendation) {
    return null;
  }

  const leaveTime =
    recommendation.leaveTime
      .toLocaleTimeString(
        'en-GB',
        {
          hour: '2-digit',
          minute: '2-digit',
        }
      );

  const meetingTime =
    recommendation.meetingTime
      .toLocaleTimeString(
        'en-GB',
        {
          hour: '2-digit',
          minute: '2-digit',
        }
      );

  return {
    text:
      `Leave home by ${leaveTime} ` +
      `for ${recommendation.title} ` +
      `(meeting at ${meetingTime}).`,
    priority: 110,
  };
}


export function buildTodaysBrief(
  input: BriefInput
): BriefData {
  const candidates:
    BriefItem[] = [];

  if (input.prayer) {
    candidates.push(
      getPrayerItem(
        input.prayer
      )
    );
  }

  const calendarItem =
    getCalendarItem(
      input.todayEvents
    );

  if (calendarItem) {
    candidates.push(
      calendarItem
    );
  }

  const travelItem =
  getTravelItem(
    input.todayEvents
  );

  if (travelItem) {
    candidates.push(
      travelItem
    );
  }  

  if (input.weather) {
    const weatherItem =
      getWeatherItem(
        input.weather
      );

    if (weatherItem) {
      candidates.push(
        weatherItem
      );
    }
  }

  if (input.nest) {
    const nestItem =
      getNestItem(
        input.nest
      );

    if (nestItem) {
      candidates.push(
        nestItem
      );
    }
  }

  candidates.sort(
    (first, second) =>
      second.priority -
      first.priority
  );

  let selected =
    candidates.filter(
      item =>
        item.priority >= 60
    );

  if (selected.length < 2) {
    const fallbackItems =
      candidates.filter(
        item =>
          item.priority < 60
      );

    selected = [
      ...selected,
      ...fallbackItems,
    ];
  }

  const items =
    selected
      .slice(0, 3)
      .map(
        item =>
          item.text
      );

  if (
    items.length < 3 &&
    input.todayEvents.length ===
      0
  ) {
    items.push(
      'No calendar commitments today.'
    );
  }

  return {
    heading:
      getHeading(input),

    items,

    updatedAt:
      new Date()
        .toLocaleTimeString(
          'en-GB',
          {
            hour: '2-digit',
            minute: '2-digit',
          }
        ),
  };
}