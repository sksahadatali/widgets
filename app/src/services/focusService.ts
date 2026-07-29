import { generateTodayFocus } from '../brain/todayBrain';
import focusItems from '../data/focus.json';

import type {
  FocusData,
  FocusItem,
} from '../types/focus';

export async function getTodayFocus(): Promise<FocusData> {
  const items = focusItems as FocusItem[];

  return generateTodayFocus(items);
}