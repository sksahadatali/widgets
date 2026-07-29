import {
  generateTodayFocus,
} from '../brain/todayBrain';

import focusItems from '../data/focus.json';

import {
  getCalendarEvents,
} from './calendarService';

import type {
  BrainResult,
} from '../brain/types';

import type {
  FocusItem,
} from '../types/focus';

export async function getTodayFocus(): Promise<BrainResult> {
  const localFocusItems =
    focusItems as FocusItem[];

  try {
    const calendarData =
      await getCalendarEvents();

    return generateTodayFocus({
      focusItems:
        localFocusItems,
      calendarEvents:
        calendarData.events,
    });
  } catch (calendarError) {
    console.warn(
      "Today's Brain could not load Calendar. Using local focus items only.",
      calendarError
    );

    return generateTodayFocus({
      focusItems:
        localFocusItems,
      calendarEvents: [],
    });
  }
}