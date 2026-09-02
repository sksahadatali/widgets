export type CalendarSourceConfig = {
  sourceId: string;
  label: string;
  kind: string;
  calendarId?: string;
  calendarName?: string;
};

export type CalendarSource = {
  id: string;
  label: string;
  kind: string;
};

export type CalendarApiEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  location?: string;
  description?: string;
  status?: string;
  calendarId?: string;
  calendarName?: string;
  calendarUrl?: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  startLocalDate: string;
  endLocalDateExclusive: string;
  allDay: boolean;
  location: string;
  description: string;
  calendarUrl: string;
  source: CalendarSource;
  semantic?: import('./calendarSemantics').CalendarEventSemantic;
};

const LOCAL_DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})$/;

function parseLocalDate(
  localDate: string
): [number, number, number] | null {
  const match = LOCAL_DATE_PATTERN.exec(localDate);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    year < 1000 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return [year, month, day];
}

export function shiftCalendarLocalDate(
  localDate: string,
  days: number
): string {
  const parsed = parseLocalDate(localDate);

  if (!parsed) {
    throw new Error('Calendar date must use YYYY-MM-DD.');
  }

  const [year, month, day] = parsed;
  const date = new Date(
    Date.UTC(year, month - 1, day + days)
  );

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

type ZonedDateParts = {
  localDate: string;
  hour: number;
  minute: number;
  second: number;
};

function getPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string | null {
  return parts.find(part => part.type === type)?.value ?? null;
}

function getZonedDateParts(
  value: string | Date,
  timeZone: string
): ZonedDateParts | null {
  if (typeof value === 'string') {
    const parsedLocalDate = parseLocalDate(value);

    if (parsedLocalDate) {
      return {
        localDate: value,
        hour: 0,
        minute: 0,
        second: 0,
      };
    }
  }

  const date = value instanceof Date
    ? value
    : new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const year = getPart(parts, 'year');
    const month = getPart(parts, 'month');
    const day = getPart(parts, 'day');
    const hour = getPart(parts, 'hour');
    const minute = getPart(parts, 'minute');
    const second = getPart(parts, 'second');

    if (
      !year || !month || !day ||
      hour === null || minute === null || second === null
    ) {
      return null;
    }

    return {
      localDate: `${year}-${month}-${day}`,
      hour: Number(hour),
      minute: Number(minute),
      second: Number(second),
    };
  } catch {
    return null;
  }
}

export function getCalendarHouseholdDate(
  instant: Date,
  timeZone: string
): string {
  const parts = getZonedDateParts(instant, timeZone);

  if (!parts) {
    throw new Error('Calendar household timezone is invalid.');
  }

  return parts.localDate;
}

function createCivilRange(
  event: CalendarApiEvent,
  timeZone: string
): {
  startLocalDate: string;
  endLocalDateExclusive: string;
} | null {
  const start = getZonedDateParts(event.start, timeZone);
  const end = getZonedDateParts(event.end, timeZone);

  if (!start) return null;

  if (event.allDay) {
    const endLocalDate = end?.localDate ??
      shiftCalendarLocalDate(start.localDate, 1);

    return {
      startLocalDate: start.localDate,
      endLocalDateExclusive:
        endLocalDate > start.localDate
          ? endLocalDate
          : shiftCalendarLocalDate(start.localDate, 1),
    };
  }

  if (!end) {
    return {
      startLocalDate: start.localDate,
      endLocalDateExclusive:
        shiftCalendarLocalDate(start.localDate, 1),
    };
  }

  const endsAtMidnight =
    end.hour === 0 &&
    end.minute === 0 &&
    end.second === 0;
  const endLocalDateExclusive = endsAtMidnight
    ? end.localDate
    : shiftCalendarLocalDate(end.localDate, 1);

  return {
    startLocalDate: start.localDate,
    endLocalDateExclusive:
      endLocalDateExclusive > start.localDate
        ? endLocalDateExclusive
        : shiftCalendarLocalDate(start.localDate, 1),
  };
}

function hashIdentity(value: string): string {
  let hash = 14695981039346656037n;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(
      64,
      hash * 1099511628211n
    );
  }

  return hash.toString(16).padStart(16, '0');
}

export function createCalendarEventIdentity(
  eventId: string,
  calendarId: string,
  calendarName: string
): string {
  const sourceIdentity =
    calendarId || calendarName || 'unknown-calendar';

  return `calendar-${hashIdentity(sourceIdentity)}-${hashIdentity(eventId)}`;
}

export function classifyCalendarSource(
  calendarId: string,
  calendarName: string,
  sources: readonly CalendarSourceConfig[]
): CalendarSource {
  const normalizedCalendarId = calendarId.trim();
  const normalizedCalendarName = calendarName.trim();
  const configuredSource = sources.find(source =>
    (
      Boolean(source.calendarId) &&
      source.calendarId?.trim() === normalizedCalendarId
    ) ||
    (
      Boolean(source.calendarName) &&
      source.calendarName?.trim() === normalizedCalendarName
    )
  );

  if (configuredSource) {
    return {
      id: configuredSource.sourceId.trim(),
      label: configuredSource.label.trim(),
      kind: configuredSource.kind.trim(),
    };
  }

  return {
    id: `calendar-${hashIdentity(
      normalizedCalendarId ||
      normalizedCalendarName ||
      'unknown-calendar'
    )}`,
    label: 'Calendar',
    kind: 'calendar',
  };
}

export function normalizeCalendarEvent(
  event: CalendarApiEvent,
  timeZone: string,
  sources: readonly CalendarSourceConfig[],
  fallbackCalendarUrl: string
): CalendarEvent | null {
  const calendarId = event.calendarId ?? '';
  const calendarName = event.calendarName ?? '';
  const civilRange = createCivilRange(event, timeZone);

  if (!event.id || !civilRange) return null;

  return {
    id: createCalendarEventIdentity(
      event.id,
      calendarId,
      calendarName
    ),
    title: event.title || 'Untitled event',
    start: event.start,
    end: event.end,
    ...civilRange,
    allDay: event.allDay ?? false,
    location: event.location ?? '',
    description: event.description ?? '',
    calendarUrl:
      event.calendarUrl || fallbackCalendarUrl,
    source: classifyCalendarSource(
      calendarId,
      calendarName,
      sources
    ),
  };
}

export function formatCalendarLocalDate(
  localDate: string,
  options: Intl.DateTimeFormatOptions
): string {
  const parsed = parseLocalDate(localDate);

  if (!parsed) return localDate;

  const [year, month, day] = parsed;

  return new Intl.DateTimeFormat('en-GB', {
    ...options,
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
