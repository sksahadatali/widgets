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
  BrainDecision,
  BrainInput,
  BrainResult,
  BrainSource,
} from './types';

import type {
  WeatherInsight,
} from '../services/weatherIntelligence';

import {
  generateContextInsights,
} from './contextIntelligence';

import type {
  ContextInsight,
} from './contextIntelligence';

const MAX_FOCUS_ITEMS = 4;

type BrainCandidate = {
  item: FocusItem;
  source: BrainSource;
  score: number;
  reasons: string[];
  deduplicationKey: string;
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
      score += 80;
      reasons.push('High priority');
      break;

    case 'medium':
      score += 55;
      reasons.push('Medium priority');
      break;

    case 'low':
      score += 30;
      reasons.push('Low priority');
      break;
  }

  if (item.status === 'in-progress') {
    score += 35;
    reasons.push('Currently in progress');
  }

  if (item.status === 'waiting') {
    score -= 20;
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
        score += 60;
        reasons.push('Overdue');
      } else if (differenceDays === 0) {
        score += 40;
        reasons.push('Due today');
      } else if (differenceDays === 1) {
        score += 20;
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
    score += 15;
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
    score += 10;
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
    score += 10;
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
        score += 35;
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

  console.group("Today's Brain");

  focusCandidates.forEach(candidate =>
    console.log(
      "TASK:",
      candidate.item.title,
      candidate.score
    )
  );
  
  calendarCandidates.forEach(candidate =>
    console.log(
      "CALENDAR:",
      candidate.item.title,
      candidate.score
    )
  );
  
  prayerCandidates.forEach(candidate =>
    console.log(
      "PRAYER:",
      candidate.item.title,
      candidate.score
    )
  );
  
  weatherCandidates.forEach(candidate =>
    console.log(
      "WEATHER:",
      candidate.item.title,
      candidate.score
    )
  );
  
  console.groupEnd();    
      
  const candidates =
    removeDuplicates([
      ...focusCandidates,
      ...calendarCandidates,
      ...prayerCandidates,
      ...contextCandidates,
      ...weatherCandidates,
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
    }));

  logBrainDecisions(decisions);

  return {
    items: decisions.map(
      decision =>
        decision.item
    ),
    generatedAt:
      now.toISOString(),
    sources,
    decisions,
  };
}
