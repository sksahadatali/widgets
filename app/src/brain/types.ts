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
import type {
  RoutineAttentionCandidate,
} from '../routines/routineSelectors';

export type BrainSource =
  | 'focus'
  | 'calendar'
  | 'prayer'
  | 'weather'  
  | 'context'
  | 'routine';

export interface BrainInput {
  focusItems: FocusItem[];
  calendarEvents: CalendarEvent[];
  prayer: PrayerData | null;
  weather: WeatherData | null;
  weatherInsights: WeatherInsight[];
  routineCandidates: RoutineAttentionCandidate[];
}

export type BrainDecisionPresentation = {
  statusLabel: string;
  metadata: string[];
  chipVariant:
    | 'danger'
    | 'warning'
    | 'info';
};

export type BrainDecisionAction = {
  type: 'open-routine';
  routineId: string;
  occurrenceId: string;
};

export interface BrainDecision {
  item: FocusItem;
  source: BrainSource;
  score: number;
  reasons: string[];
  presentation?: BrainDecisionPresentation;
  action?: BrainDecisionAction;
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
