import {
  getCalendarEvents,
} from './calendarService';

import {
  getNextPrayer,
} from './prayerService';

import type {
  BrainInput,
} from '../brain/types';


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

import { fetchFocusItems } from "./taskService";

export async function getTodayFocusSources(): Promise<
  Omit<BrainInput, 'routineCandidates'>
> {

  let calendarEvents: CalendarEvent[] = [];
  let prayer = null;
  let weather: WeatherData | null = null;
  let weatherInsights: WeatherInsight[] = [];

  const focusItems = await fetchFocusItems();

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

  return {
    focusItems: focusItems,
    calendarEvents,
    prayer,
    weather,
    weatherInsights,
  };
}
