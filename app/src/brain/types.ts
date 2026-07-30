import type {
  CalendarEvent,
} from '../services/calendarService';

import type {
  PrayerData,
} from '../services/prayerService';

import type {
  FocusItem,
} from '../types/focus';

export type BrainSource =
  | 'focus'
  | 'calendar'
  | 'prayer';

export interface BrainInput {
  focusItems: FocusItem[];
  calendarEvents: CalendarEvent[];
  prayer: PrayerData | null;
}

export interface BrainDecision {
  item: FocusItem;
  source: BrainSource;
  score: number;
  reasons: string[];
}

export interface BrainResult {
  items: FocusItem[];
  generatedAt: string;
  sources: BrainSource[];
  decisions: BrainDecision[];
}