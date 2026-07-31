import {
  generateTodayFocus,
} from '../brain/todayBrain';

import focusItems from '../data/focus.json';

import {
  getCalendarEvents,
} from './calendarService';

import {
  getNextPrayer,
} from './prayerService';

import type {
  BrainResult,
} from '../brain/types';

import type {
  FocusItem,
} from '../types/focus';

import type {
  CalendarEvent,
} from './calendarService';

import {
  getCurrentWeather,
} from './weatherService';

import {
  generateWeatherInsights,
} from './weatherIntelligence';

import type {
  WeatherData,
} from './weatherService';

import type {
  WeatherInsight,
} from './weatherIntelligence';

export async function getTodayFocus(): Promise<BrainResult> {
  const localFocusItems =
    focusItems as FocusItem[];

  let calendarEvents: CalendarEvent[] = [];
  let prayer = null;
  let weather: WeatherData | null = null;
  let weatherInsights: WeatherInsight[] = [];

  //
  // Load Calendar
  //
  try {
    const calendarData =
      await getCalendarEvents();

    calendarEvents =
      calendarData.events;
  } catch (calendarError) {
    console.warn(
      "Today's Brain could not load Calendar.",
      calendarError
    );
  }

  //
  // Load Prayer
  //
  try {
    prayer =
      await getNextPrayer();
  } catch (prayerError) {
    console.warn(
      "Today's Brain could not load Prayer.",
      prayerError
    );
  }

  //
  // Load Weather
  //
  try {
    weather =
      await getCurrentWeather();

    weatherInsights =
      generateWeatherInsights(
        weather
      );
  } catch (weatherError) {
    console.warn(
      "Today's Brain could not load Weather.",
      weatherError
    );
  }

  //
  // Generate Today's Focus
  //
  return generateTodayFocus({
    focusItems: localFocusItems,
    calendarEvents,
    prayer,
    weather,
    weatherInsights,
  });
}
