import {
  classifyCalendarEvent,
  type CalendarSemanticRule,
  type CalendarEventSemantic,
  type SchoolSemanticKind,
} from './calendarSemantics';

import {
  formatCalendarLocalDate,
  getCalendarHouseholdDate,
  shiftCalendarLocalDate,
  type CalendarEvent,
} from './calendarModel';

export type SchoolBriefInsight = {
  text: string;
  consumedEventIds: string[];
};

type ClassifiedEvent = {
  event: CalendarEvent;
  semantic: CalendarEventSemantic;
};

type InsightCandidate = {
  date: string;
  kind: SchoolSemanticKind;
  kindOrder: number;
  text: string;
  consumedEventIds: string[];
};

const KIND_ORDER: Record<SchoolSemanticKind, number> = {
  'school.training-day': 0,
  'school.holiday': 1,
  'school.reopens': 2,
};

// Allows a weekend or Bank Holiday between a holiday and return.
const HOLIDAY_REOPEN_ASSOCIATION_DAYS = 3;
const MAX_BRIEF_LABEL_LENGTH = 80;

function eventOverlapsDate(
  event: CalendarEvent,
  localDate: string
): boolean {
  return (
    event.startLocalDate <= localDate &&
    event.endLocalDateExclusive > localDate
  );
}

function getSemanticLabel(
  item: ClassifiedEvent
): string {
  const label = (
    item.semantic.label?.trim() ||
    item.event.title.trim() ||
    'School event'
  )
    .replace(/\s+/g, ' ')
    .slice(0, MAX_BRIEF_LABEL_LENGTH)
    .trim();

  return label || 'School event';
}

function normalizeLabel(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en-GB');
}

function getEquivalentEvents(
  events: readonly ClassifiedEvent[],
  item: ClassifiedEvent,
  date: string
): ClassifiedEvent[] {
  const label = normalizeLabel(
    getSemanticLabel(item)
  );

  return events.filter(candidate =>
    candidate.semantic.kind === item.semantic.kind &&
    candidate.event.startLocalDate ===
      item.event.startLocalDate &&
    candidate.event.endLocalDateExclusive ===
      item.event.endLocalDateExclusive &&
    normalizeLabel(getSemanticLabel(candidate)) === label &&
    (
      item.semantic.kind === 'school.training-day'
        ? eventOverlapsDate(candidate.event, date)
        : candidate.event.startLocalDate === date
    )
  );
}

function uniqueEventIds(
  events: readonly ClassifiedEvent[]
): string[] {
  return [...new Set(
    events.map(item => item.event.id)
  )];
}

function hasClosureOnDate(
  events: readonly ClassifiedEvent[],
  localDate: string
): boolean {
  return events.some(item =>
    (
      item.semantic.kind === 'school.training-day' ||
      item.semantic.kind === 'school.holiday'
    ) &&
    eventOverlapsDate(item.event, localDate)
  );
}

function hasReopeningOnDate(
  events: readonly ClassifiedEvent[],
  localDate: string
): boolean {
  return events.some(item =>
    item.semantic.kind === 'school.reopens' &&
    item.event.startLocalDate === localDate
  );
}

function isConflictedDate(
  events: readonly ClassifiedEvent[],
  localDate: string
): boolean {
  return (
    hasClosureOnDate(events, localDate) &&
    hasReopeningOnDate(events, localDate)
  );
}

function getRelativeDay(
  localDate: string,
  today: string,
  tomorrow: string
): string {
  if (localDate === today) {
    return 'today';
  }

  if (localDate === tomorrow) {
    return 'tomorrow';
  }

  return formatCalendarLocalDate(
    localDate,
    { weekday: 'long' }
  );
}

function findAssociatedHolidayLabel(
  events: readonly ClassifiedEvent[],
  reopeningDate: string
): string | null {
  const earliestAssociatedEnd =
    shiftCalendarLocalDate(
      reopeningDate,
      -HOLIDAY_REOPEN_ASSOCIATION_DAYS
    );
  const precedingHolidays = events
    .filter(item =>
      item.semantic.kind === 'school.holiday' &&
      item.event.endLocalDateExclusive <= reopeningDate &&
      item.event.endLocalDateExclusive >= earliestAssociatedEnd
    )
    .sort((first, second) =>
      second.event.endLocalDateExclusive.localeCompare(
        first.event.endLocalDateExclusive
      )
    );

  if (precedingHolidays.length === 0) {
    return null;
  }

  const nearestEnd =
    precedingHolidays[0].event.endLocalDateExclusive;
  const nearestLabels = new Map<string, string>();

  precedingHolidays
    .filter(item =>
      item.event.endLocalDateExclusive === nearestEnd
    )
    .forEach(item => {
      const label = getSemanticLabel(item);

      nearestLabels.set(
        normalizeLabel(label),
        label
      );
    });

  return nearestLabels.size === 1
    ? [...nearestLabels.values()][0]
    : null;
}

function createTrainingCandidates(
  events: readonly ClassifiedEvent[],
  today: string,
  tomorrow: string
): InsightCandidate[] {
  const candidates: InsightCandidate[] = [];

  [today, tomorrow].forEach(date => {
    if (isConflictedDate(events, date)) {
      return;
    }

    const trainingEvents = events.filter(item =>
      item.semantic.kind === 'school.training-day' &&
      eventOverlapsDate(item.event, date)
    );

    trainingEvents.forEach(item => {
      const equivalentEvents = getEquivalentEvents(
        trainingEvents,
        item,
        date
      );
      const overlappingHolidays = events.filter(candidate =>
        candidate.semantic.kind === 'school.holiday' &&
        eventOverlapsDate(candidate.event, date)
      );

      candidates.push({
        date,
        kind: 'school.training-day',
        kindOrder: KIND_ORDER['school.training-day'],
        text:
          `School closed ${getRelativeDay(date, today, tomorrow)}` +
          ` — ${getSemanticLabel(item)}`,
        consumedEventIds: uniqueEventIds([
          ...equivalentEvents,
          ...overlappingHolidays,
        ]),
      });
    });
  });

  return candidates;
}

function createHolidayCandidates(
  events: readonly ClassifiedEvent[],
  today: string,
  tomorrow: string
): InsightCandidate[] {
  return events
    .filter(item =>
      item.semantic.kind === 'school.holiday' &&
      (
        item.event.startLocalDate === today ||
        item.event.startLocalDate === tomorrow
      ) &&
      !isConflictedDate(
        events,
        item.event.startLocalDate
      )
    )
    .map(item => ({
      date: item.event.startLocalDate,
      kind: 'school.holiday' as const,
      kindOrder: KIND_ORDER['school.holiday'],
      text:
        `${getSemanticLabel(item)} starts ` +
        getRelativeDay(
          item.event.startLocalDate,
          today,
          tomorrow
        ),
      consumedEventIds: uniqueEventIds(
        getEquivalentEvents(
          events,
          item,
          item.event.startLocalDate
        )
      ),
    }));
}

function createReopeningCandidates(
  events: readonly ClassifiedEvent[],
  today: string,
  tomorrow: string
): InsightCandidate[] {
  return events
    .filter(item =>
      item.semantic.kind === 'school.reopens' &&
      item.event.startLocalDate >= today &&
      !isConflictedDate(
        events,
        item.event.startLocalDate
      )
    )
    .map(item => {
      const date = item.event.startLocalDate;
      const holidayLabel =
        findAssociatedHolidayLabel(events, date);

      return {
        date,
        kind: 'school.reopens' as const,
        kindOrder: KIND_ORDER['school.reopens'],
        text:
          `School reopens ${getRelativeDay(date, today, tomorrow)}` +
          (holidayLabel
            ? ` after ${holidayLabel}`
            : ''),
        consumedEventIds: uniqueEventIds(
          getEquivalentEvents(
            events,
            item,
            date
          )
        ),
      };
    });
}

function deduplicateCandidates(
  candidates: readonly InsightCandidate[]
): InsightCandidate[] {
  const deduplicated = new Map<
    string,
    InsightCandidate
  >();

  candidates.forEach(candidate => {
    const key =
      `${candidate.date}\u0000${candidate.kind}` +
      `\u0000${normalizeLabel(candidate.text)}`;
    const existing = deduplicated.get(key);

    deduplicated.set(key, {
      ...candidate,
      consumedEventIds: [
        ...new Set([
          ...(existing?.consumedEventIds ?? []),
          ...candidate.consumedEventIds,
        ]),
      ],
    });
  });

  return [...deduplicated.values()];
}

export function selectSchoolBriefInsight(
  events: readonly CalendarEvent[],
  timeZone: string,
  now: Date,
  rules: readonly CalendarSemanticRule[]
): SchoolBriefInsight | null {
  const today = getCalendarHouseholdDate(
    now,
    timeZone
  );
  const tomorrow = shiftCalendarLocalDate(
    today,
    1
  );
  const classifiedEvents = events
    .map(event => ({
      event,
      semantic: classifyCalendarEvent(
        event,
        rules
      ),
    }))
    .filter(
      (
        item
      ): item is ClassifiedEvent =>
        item.semantic !== null
    );

  const candidates = deduplicateCandidates([
    ...createTrainingCandidates(
      classifiedEvents,
      today,
      tomorrow
    ),
    ...createHolidayCandidates(
      classifiedEvents,
      today,
      tomorrow
    ),
    ...createReopeningCandidates(
      classifiedEvents,
      today,
      tomorrow
    ),
  ]).sort((first, second) =>
    first.date.localeCompare(second.date) ||
    first.kindOrder - second.kindOrder ||
    first.text.localeCompare(second.text)
  );

  const selected = candidates[0];

  return selected
    ? {
        text: selected.text,
        consumedEventIds: selected.consumedEventIds,
      }
    : null;
}
