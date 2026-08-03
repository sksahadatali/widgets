import type {
  CalendarEvent,
} from '../services/calendarService';

import type {
  PrayerData,
} from '../services/prayerService';

import type {
  FocusItem,
} from '../types/focus';

import type {
  WeatherData,
} from '../services/weatherService';

import type {
  WeatherInsight,
} from '../services/weatherIntelligence';

export type BrainSource =
  | 'focus'
  | 'calendar'
  | 'prayer'
  | 'weather'  
  | 'context';  

export interface BrainInput {
  focusItems: FocusItem[];
  calendarEvents: CalendarEvent[];
  prayer: PrayerData | null;
  weather: WeatherData | null;
  weatherInsights: WeatherInsight[];
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

export interface BriefItem {
  id: string;
  title: string;
  description?: string;
  priority: 'high' | 'medium' | 'low';
  source: BrainSource;
  score: number;
  action?: string;
}