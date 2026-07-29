import type {
  CalendarEvent,
} from '../services/calendarService';

import type {
  FocusItem,
} from '../types/focus';

export type BrainSource =
  | 'focus'
  | 'calendar';

export interface BrainInput {
  focusItems: FocusItem[];
  calendarEvents: CalendarEvent[];
}

export interface BrainResult {
  items: FocusItem[];
  generatedAt: string;
  sources: BrainSource[];
}