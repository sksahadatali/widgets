import type {
  CalendarEvent,
} from '../services/calendarService';

import type {
  PrayerData,
} from '../services/prayerService';

import type {
  FocusItem,
} from '../types/focus';

import {
  logBrainDecisions,
} from './logger';

import type {
  BrainDecisionAction,
  BrainDecisionPresentation,
  BrainDecision,
  BrainInput,
  BrainResult,
  BrainSource,
} from './types';

import type {
  RoutineAttentionCandidate,
} from '../routines/routineSelectors';

import {
  timeToMinutes,
} from '../routines/recurrence';

import type {
  WeatherInsight,
} from '../services/weatherIntelligence';

import {
  generateContextInsights,
} from './contextIntelligence';

import type {
  ContextInsight,
} from './contextIntelligence';

import { BrainRules } from "./brainRules";


const MAX_FOCUS_ITEMS = 4;

type BrainCandidate = {
  item: FocusItem;
  source: BrainSource;
  score: number;
  reasons: string[];
  deduplicationKey: string;
  presentation?: BrainDecisionPresentation;
  action?: BrainDecisionAction;
  routineSortMinutes?: number;
  routineTieKey?: string;
};


function getLocalDateString(
  date: Date
): string {
  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, '0');
  const day = String(
    date.getDate()
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function normaliseTitle(
  title: string
): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isValidDate(
  date: Date
): boolean {
  return !Number.isNaN(
    date.getTime()
  );
}

function isEventToday(
  event: CalendarEvent,
  today: string
): boolean {
  if (event.allDay) {
    return event.start.slice(0, 10) === today;
  }

  const startDate =
    new Date(event.start);

  if (!isValidDate(startDate)) {
    return false;
  }

  return (
    getLocalDateString(startDate) ===
    today
  );
}

function isFinishedCalendarEvent(
  event: CalendarEvent,
  now: Date
): boolean {
  if (event.allDay) {
    return false;
  }

  const endDate =
    new Date(event.end);

  if (!isValidDate(endDate)) {
    return false;
  }

  return (
    endDate.getTime() <
    now.getTime()
  );
}

function formatEventTime(
  event: CalendarEvent
): string | null {
  if (event.allDay) {
    return null;
  }

  const startDate =
    new Date(event.start);

  if (!isValidDate(startDate)) {
    return null;
  }

  return new Intl.DateTimeFormat(
    'en-GB',
    {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }
  ).format(startDate);
}

function calculateEventDuration(
  event: CalendarEvent
): number | null {
  if (event.allDay) {
    return null;
  }

  const startDate =
    new Date(event.start);
  const endDate =
    new Date(event.end);

  if (
    !isValidDate(startDate) ||
    !isValidDate(endDate)
  ) {
    return null;
  }

  const durationMilliseconds =
    endDate.getTime() -
    startDate.getTime();

  const durationMinutes =
    Math.round(
      durationMilliseconds /
        (1000 * 60)
    );

  return durationMinutes > 0
    ? durationMinutes
    : null;
}

function calendarEventToFocusItem(
  event: CalendarEvent
): FocusItem {
  const eventTime =
    formatEventTime(event);

  return {
    id: `calendar-${event.id}`,
    title: eventTime
      ? `${eventTime} — ${event.title}`
      : event.title,
    category: 'family',
    priority: 'medium',
    status: 'pending',
    dueDate:
      event.start.slice(0, 10),
    dueTime: eventTime,
    estimatedMinutes:
      calculateEventDuration(event),
    assignedTo: 'Calendar',
  };
}

function scoreFocusItem(
  item: FocusItem,
  now: Date
): BrainCandidate {
  let score = 0;

  const reasons: string[] = [];

  switch (item.priority) {
    case 'high':
      score += BrainRules.PRIORITY.HIGH;
      reasons.push('High priority');
      break;

    case 'medium':
      score += BrainRules.PRIORITY.MEDIUM;
      reasons.push('Medium priority');
      break;

    case 'low':
      score += BrainRules.PRIORITY.LOW;
      reasons.push('Low priority');
      break;
  }

  if (item.status === 'in-progress') {
    score += BrainRules.STATUS.IN_PROGRESS;
    reasons.push('Currently in progress');
  }

  if (item.status === 'waiting') {
    score += BrainRules.STATUS.WAITING;
    reasons.push('Waiting on another action');
  }

  const today =
    getLocalDateString(now);

  const todayDate =
    new Date(`${today}T00:00:00`);

  if (item.dueDate) {
    const dueDate =
      new Date(
        `${item.dueDate}T00:00:00`
      );

    if (isValidDate(dueDate)) {
      const differenceDays =
        Math.round(
          (
            dueDate.getTime() -
            todayDate.getTime()
          ) /
          (1000 * 60 * 60 * 24)
        );

      if (differenceDays < 0) {
        score += BrainRules.DUE.OVERDUE;
        reasons.push('Overdue');
      } else if (differenceDays === 0) {
        score += BrainRules.DUE.TODAY;
        reasons.push('Due today');
      } else if (differenceDays === 1) {
        score += BrainRules.DUE.TOMORROW;
        reasons.push('Due tomorrow');
      }
    }
  }

  const currentHour =
    now.getHours();

  if (
    item.category === 'work' &&
    currentHour >= 8 &&
    currentHour < 18
  ) {
    score += BrainRules.CONTEXT.WORK_HOURS;
    reasons.push('Relevant during work hours');
  }

  if (
    (
      item.category === 'personal' ||
      item.category === 'home' ||
      item.category === 'family'
    ) &&
    currentHour >= 18
  ) {
    score += BrainRules.CONTEXT.EVENING;
    reasons.push('Relevant this evening');
  }

  const currentDay =
    now.getDay();

  const isWeekend =
    currentDay === 0 ||
    currentDay === 6;

  if (
    item.category === 'raen' &&
    isWeekend
  ) {
    score += BrainRules.CONTEXT.WEEKEND_RAEN;
    reasons.push('Suitable for weekend review');
  }

  if (
    item.dueDate === today &&
    item.dueTime
  ) {
    const dueDateTime =
      new Date(
        `${item.dueDate}T${item.dueTime}:00`
      );

    if (isValidDate(dueDateTime)) {
      const minutesUntilDue =
        (
          dueDateTime.getTime() -
          now.getTime()
        ) /
        (1000 * 60);

      if (
        minutesUntilDue >= 0 &&
        minutesUntilDue <= 60
      ) {
        score += BrainRules.DUE.NEXT_HOUR;
        reasons.push(
          'Due within one hour'
        );
      }
    }
  }

  return {
    item,
    source: 'focus',
    score,
    reasons,
    deduplicationKey:
      normaliseTitle(item.title),
  };
}

function scoreCalendarEvent(
  event: CalendarEvent,
  now: Date
): BrainCandidate {
  const item =
    calendarEventToFocusItem(event);

  const reasons: string[] = [
    'Calendar event',
  ];

  if (event.allDay) {
    reasons.push(
      'All-day event'
    );

    return {
      item,
      source: 'calendar',
      score: 75,
      reasons,
      deduplicationKey:
        normaliseTitle(event.title),
    };
  }

  const startDate =
    new Date(event.start);
  const endDate =
    new Date(event.end);

  if (
    !isValidDate(startDate) ||
    !isValidDate(endDate)
  ) {
    reasons.push(
      'Scheduled today'
    );

    return {
      item,
      source: 'calendar',
      score: 70,
      reasons,
      deduplicationKey:
        normaliseTitle(event.title),
    };
  }

  const nowTime =
    now.getTime();

  const minutesUntilStart =
    (
      startDate.getTime() -
      nowTime
    ) /
    (1000 * 60);

  const eventIsHappening =
    startDate.getTime() <= nowTime &&
    endDate.getTime() >= nowTime;

  let score = 90;

  reasons.push(
    'Scheduled today'
  );

  if (eventIsHappening) {
    score = 140;
    reasons.push(
      'Happening now'
    );
  } else if (
    minutesUntilStart >= 0 &&
    minutesUntilStart <= 60
  ) {
    score = 125;
    reasons.push(
      'Starts within one hour'
    );
  } else if (
    minutesUntilStart > 60 &&
    minutesUntilStart <= 180
  ) {
    score = 110;
    reasons.push(
      'Starts within three hours'
    );
  }

  return {
    item,
    source: 'calendar',
    score,
    reasons,
    deduplicationKey:
      normaliseTitle(event.title),
  };
}

function scorePrayer(
  prayer: PrayerData
): BrainCandidate {
  const item: FocusItem = {
    id: `prayer-${prayer.name.toLowerCase()}`,
    title: `${prayer.name} Prayer`,
    category: 'faith',
    priority: 'high',
    status: 'pending',
    dueDate: prayer.dateTime.slice(0, 10),
    dueTime: prayer.time,
    estimatedMinutes: 15,
    assignedTo: 'Faith',
  };

  let score = 85;

  const reasons = [
    'Prayer reminder',
  ];

  if (prayer.isCurrentPrayer) {
    score = 150;
    reasons.push(
      'Prayer time now'
    );
  } else if (prayer.isDueSoon) {
    score = 130;
    reasons.push(
      'Prayer due soon'
    );
  }

  return {
    item,
    source: 'prayer',
    score,
    reasons,
    deduplicationKey:
      `prayer-${prayer.name.toLowerCase()}`,
  };
}

function scoreWeatherInsight(
  insight: WeatherInsight
): BrainCandidate {
  const item: FocusItem = {
    id: insight.id,
    title: insight.action,
    category: 'personal',
    priority:
      insight.severity === 'high'
        ? 'high'
        : insight.severity === 'medium'
        ? 'medium'
        : 'low',
    status: 'pending',
    dueDate: null,
    dueTime: null,
    estimatedMinutes: 5,
    assignedTo: 'Weather',
  };

  return {
    item,
    source: 'weather',
    score: insight.score,
    reasons: [
      'Weather intelligence',
      insight.title,
    ],
    deduplicationKey: insight.id,
  };
}

function scoreContextInsight(
  insight: ContextInsight
): BrainCandidate {
  const item: FocusItem = {
    id: insight.id,
    title: insight.title,
    category: 'personal',
    priority:
      insight.score >= 100
        ? 'high'
        : 'medium',
    status: 'pending',
    dueDate: null,
    dueTime: null,
    estimatedMinutes: 5,
    assignedTo: 'eY Brain',
  };

  return {
    item,
    source: 'context',
    score: insight.score,
    reasons: insight.reasons,
    deduplicationKey:
      insight.id,
  };
}

function getRoutineScore(
  candidate: RoutineAttentionCandidate
): number {
  if (candidate.status === 'overdue') {
    return BrainRules.ROUTINE.OVERDUE;
  }

  if (candidate.displayStatus === 'In progress') {
    return BrainRules.ROUTINE.IN_PROGRESS;
  }

  if (candidate.status === 'due') {
    return BrainRules.ROUTINE.DUE;
  }

  if (candidate.status === 'upcoming') {
    return BrainRules.ROUTINE.UPCOMING;
  }

  return BrainRules.ROUTINE.TODAY;
}

function getRoutineAttentionTime(
  candidate: RoutineAttentionCandidate
): string | null {
  if (candidate.status === 'upcoming') {
    return candidate.startTime;
  }

  if (
    candidate.status === 'overdue' ||
    candidate.status === 'due'
  ) {
    return candidate.endTime ?? candidate.startTime;
  }

  return null;
}

function getRoutineTimeMetadata(
  candidate: RoutineAttentionCandidate
): string | null {
  if (
    candidate.status === 'upcoming' &&
    candidate.startTime
  ) {
    return candidate.startTime;
  }

  if (
    candidate.status === 'overdue' &&
    candidate.endTime
  ) {
    return `ended ${candidate.endTime}`;
  }

  if (
    candidate.status === 'due' &&
    candidate.endTime
  ) {
    return `until ${candidate.endTime}`;
  }

  if (
    candidate.status === 'due' &&
    candidate.startTime
  ) {
    return `from ${candidate.startTime}`;
  }

  return null;
}

function getRoutineChipVariant(
  candidate: RoutineAttentionCandidate
): BrainDecisionPresentation['chipVariant'] {
  if (candidate.status === 'overdue') {
    return 'danger';
  }

  if (
    candidate.status === 'due' ||
    candidate.displayStatus === 'In progress'
  ) {
    return 'warning';
  }

  return 'info';
}

function isEligibleRoutineCandidate(
  candidate: RoutineAttentionCandidate
): boolean {
  if (candidate.status !== 'upcoming') {
    return true;
  }

  return (
    candidate.minutesUntilStart !== null &&
    candidate.minutesUntilStart >= 0 &&
    candidate.minutesUntilStart <=
      BrainRules.ROUTINE.UPCOMING_HORIZON_MINUTES
  );
}

function scoreRoutineCandidate(
  candidate: RoutineAttentionCandidate
): BrainCandidate {
  const attentionTime =
    getRoutineAttentionTime(candidate);
  const timeMetadata =
    getRoutineTimeMetadata(candidate);
  const metadata = [
    timeMetadata,
    `${candidate.completedSteps}/${candidate.totalSteps}`,
  ].filter(
    (value): value is string => Boolean(value)
  );
  const item: FocusItem = {
    id: `routine-${candidate.occurrenceId}`,
    title: candidate.title,
    category: 'family',
    priority:
      candidate.status === 'overdue' ||
      candidate.status === 'due'
        ? 'high'
        : 'medium',
    status:
      candidate.displayStatus === 'In progress'
        ? 'in-progress'
        : 'pending',
    dueDate: candidate.localDate,
    dueTime: attentionTime,
    estimatedMinutes: null,
    assignedTo: 'Routine',
  };

  return {
    item,
    source: 'routine',
    score: getRoutineScore(candidate),
    reasons: [
      'Household routine',
      candidate.displayStatus,
      `${candidate.completedSteps} of ${candidate.totalSteps} steps complete`,
    ],
    deduplicationKey:
      `routine:${candidate.occurrenceId}`,
    presentation: {
      statusLabel: candidate.displayStatus,
      metadata,
      chipVariant:
        getRoutineChipVariant(candidate),
    },
    action: {
      type: 'open-routine',
      routineId: candidate.routineId,
      occurrenceId: candidate.occurrenceId,
    },
    routineSortMinutes: attentionTime
      ? timeToMinutes(attentionTime)
      : Number.POSITIVE_INFINITY,
    routineTieKey:
      `${candidate.title}\u0000${candidate.occurrenceId}`,
  };
}

function compareRoutineCandidates(
  first: BrainCandidate,
  second: BrainCandidate
): number {
  const scoreDifference =
    second.score - first.score;

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  const timeDifference =
    (first.routineSortMinutes ??
      Number.POSITIVE_INFINITY) -
    (second.routineSortMinutes ??
      Number.POSITIVE_INFINITY);

  if (timeDifference !== 0) {
    return timeDifference;
  }

  return (
    first.routineTieKey ?? ''
  ).localeCompare(
    second.routineTieKey ?? ''
  );
}

function isEligibleFocusItem(
  item: FocusItem,
  today: string
): boolean {
  if (item.status === 'completed') {
    return false;
  }

  if (item.status === 'in-progress') {
    return true;
  }

  if (!item.dueDate) {
    return false;
  }

  const dueDate = new Date(
    `${item.dueDate}T00:00:00`
  );

  const todayDate = new Date(
    `${today}T00:00:00`
  );

  const tomorrowDate = new Date(
    todayDate
  );

  tomorrowDate.setDate(
    tomorrowDate.getDate() + 1
  );

  return (
    dueDate <= tomorrowDate
  );
}

function removeDuplicates(
  candidates: BrainCandidate[]
): BrainCandidate[] {
  const uniqueCandidates =
    new Map<
      string,
      BrainCandidate
    >();

  candidates.forEach(candidate => {
    const existing =
      uniqueCandidates.get(
        candidate.deduplicationKey
      );

    if (
      !existing ||
      candidate.score >
        existing.score
    ) {
      uniqueCandidates.set(
        candidate.deduplicationKey,
        candidate
      );
    }
  });

  return Array.from(
    uniqueCandidates.values()
  );
}

function compareCandidates(
  first: BrainCandidate,
  second: BrainCandidate
): number {
  const scoreDifference =
    second.score - first.score;

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  if (
    first.item.dueTime &&
    second.item.dueTime
  ) {
    return first.item.dueTime.localeCompare(
      second.item.dueTime
    );
  }

  if (
    first.item.dueTime &&
    !second.item.dueTime
  ) {
    return -1;
  }

  if (
    !first.item.dueTime &&
    second.item.dueTime
  ) {
    return 1;
  }

  return first.item.title.localeCompare(
    second.item.title
  );
}

export function generateTodayFocus(
  input: BrainInput,
  now: Date = new Date()
): BrainResult {
  const today =
    getLocalDateString(now);

  const focusCandidates =
    input.focusItems
      .filter(item =>
        isEligibleFocusItem(
          item,
          today
        )
      )
      .map(item =>
        scoreFocusItem(
          item,
          now
        )
      );

  const calendarCandidates =
    input.calendarEvents
      .filter(event =>
        isEventToday(
          event,
          today
        )
      )
      .filter(
        event =>
          !isFinishedCalendarEvent(
            event,
            now
          )
      )
      .map(event =>
        scoreCalendarEvent(
          event,
          now
        )
      );
  
  const prayerCandidates =
    input.prayer
      ? [
          scorePrayer(
            input.prayer
          ),
        ]
      : [];    
      const contextInsights =
      generateContextInsights(
        input.calendarEvents,
        input.weatherInsights,
        now
      );
    
  const contextCandidates =
    contextInsights.map(
      scoreContextInsight
    );
  
  const consumedWeatherInsightIds =
    new Set(
      contextInsights.map(
        insight =>
          insight
            .consumedWeatherInsightId
      )
    );


  const weatherCandidates =
  input.weatherInsights
    .filter(
      insight =>
        insight.type !== 'comfort'
    )
    .filter(
      insight =>
        !consumedWeatherInsightIds.has(
          insight.id
        )
    )
    .map(scoreWeatherInsight);    

  const routineCandidates =
    removeDuplicates(
      input.routineCandidates
        .filter(isEligibleRoutineCandidate)
        .map(scoreRoutineCandidate)
        .sort(compareRoutineCandidates)
    ).slice(
      0,
      BrainRules.ROUTINE.MAX_CANDIDATES
    );

      
  const candidates =
    removeDuplicates([
      ...focusCandidates,
      ...calendarCandidates,
      ...prayerCandidates,
      ...contextCandidates,
      ...weatherCandidates,
      ...routineCandidates,
    ])
      .sort(compareCandidates)
      .slice(
        0,
        MAX_FOCUS_ITEMS
      );

  const sources =
    Array.from(
      new Set(
        candidates.map(
          candidate =>
            candidate.source
        )
      )
    );

  const decisions: BrainDecision[] =
  candidates.map(candidate => ({
    item: candidate.item,
    source: candidate.source,
    score: candidate.score,
    reasons: candidate.reasons,
    presentation: candidate.presentation,
    action: candidate.action,
  }));
  
  logBrainDecisions(decisions);
  
  return {
    items: decisions.map(
      decision => decision.item
    ),
    generatedAt: now.toISOString(),
    sources,
    decisions,
  };
}
