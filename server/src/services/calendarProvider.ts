import {
  getHouseholdConfig,
  type CalendarSemanticRule,
  type CalendarSourceConfig,
} from '../config/householdConfig.js';

type ProviderEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  location?: string;
  description?: string;
  calendarId?: string;
  calendarName?: string;
};

type ProviderResponse = {
  success: boolean;
  generatedAt?: string;
  timeZone?: string;
  events?: ProviderEvent[];
};

type Semantic = {
  kind: CalendarSemanticRule['kind'];
  label?: string;
};

export type SafeCalendarEvent = {
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
  source: { id: string; label: string; kind: string };
  semantic?: Semantic;
};

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function shiftDate(value: string, days: number): string {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new Error('Invalid Calendar date.');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function zonedParts(value: string, timeZone: string): { date: string; atMidnight: boolean } | null {
  if (DATE_PATTERN.test(value)) return { date: value, atMidnight: true };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
    return {
      date: `${get('year')}-${get('month')}-${get('day')}`,
      atMidnight: get('hour') === '00' && get('minute') === '00' && get('second') === '00',
    };
  } catch { return null; }
}

function civilRange(event: ProviderEvent, timeZone: string) {
  const start = zonedParts(event.start, timeZone);
  const end = zonedParts(event.end, timeZone);
  if (!start) return null;
  if (event.allDay) {
    const endDate = end?.date ?? shiftDate(start.date, 1);
    return { startLocalDate: start.date, endLocalDateExclusive: endDate > start.date ? endDate : shiftDate(start.date, 1) };
  }
  const exclusive = end ? (end.atMidnight ? end.date : shiftDate(end.date, 1)) : shiftDate(start.date, 1);
  return { startLocalDate: start.date, endLocalDateExclusive: exclusive > start.date ? exclusive : shiftDate(start.date, 1) };
}

function hash(value: string): string {
  let result = 14695981039346656037n;
  for (let index = 0; index < value.length; index += 1) {
    result ^= BigInt(value.charCodeAt(index));
    result = BigInt.asUintN(64, result * 1099511628211n);
  }
  return result.toString(16).padStart(16, '0');
}

function sourceFor(event: ProviderEvent, sources: readonly CalendarSourceConfig[]) {
  const calendarId = event.calendarId?.trim() ?? '';
  const calendarName = event.calendarName?.trim() ?? '';
  const source = sources.find(item =>
    (item.calendarId && item.calendarId === calendarId) ||
    (item.calendarName && item.calendarName === calendarName)
  );
  return source
    ? { id: source.sourceId, label: source.label, kind: source.kind }
    : { id: `calendar-${hash(calendarId || calendarName || 'unknown-calendar')}`, label: 'Calendar', kind: 'calendar' };
}

function marker(description: string): Semantic | null | 'invalid' {
  const lines = description.split(/\r?\n/).map(line => line.trim()).filter(line => /^eyos\.(kind|label)\b/i.test(line));
  if (lines.length === 0) return null;
  const kindLines = lines.filter(line => line.startsWith('eyos.kind='));
  const labelLines = lines.filter(line => line.startsWith('eyos.label='));
  if (kindLines.length !== 1 || labelLines.length > 1 || lines.length !== kindLines.length + labelLines.length) return 'invalid';
  const kind = kindLines[0].slice(10).trim();
  if (!['school.training-day', 'school.holiday', 'school.reopens'].includes(kind)) return 'invalid';
  const label = labelLines[0]?.slice(11).trim();
  if (labelLines.length && (!label || label.length > 80)) return 'invalid';
  return { kind: kind as Semantic['kind'], ...(label ? { label } : {}) };
}

function semanticFor(event: SafeCalendarEvent, description: string, rules: readonly CalendarSemanticRule[]): Semantic | undefined {
  if (event.source.kind !== 'school') return undefined;
  const parsed = marker(description);
  if (parsed === 'invalid') return undefined;
  if (parsed) return parsed;
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-GB');
  const eligible = rules.filter(rule => rule.sourceId === event.source.id);
  const exact = eligible.filter(rule => rule.titleEquals && normalize(rule.titleEquals) === normalize(event.title));
  const matches = exact.length ? exact : eligible.filter(rule => rule.titleIncludes && normalize(event.title).includes(normalize(rule.titleIncludes)));
  const distinct = new Map(matches.map(rule => [`${rule.kind}\0${rule.label ?? ''}`, { kind: rule.kind, ...(rule.label ? { label: rule.label } : {}) }]));
  return distinct.size === 1 ? [...distinct.values()][0] : undefined;
}

export async function getSafeCalendarData(fetcher: typeof fetch = fetch) {
  const config = getHouseholdConfig();
  const response = await fetcher(config.calendar.endpoint, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Calendar provider request failed.');
  const data = await response.json() as ProviderResponse;
  if (!data.success) throw new Error('Calendar provider returned an unsuccessful response.');
  const timeZone = data.timeZone || config.location.timezone;
  const events = (data.events ?? []).flatMap(providerEvent => {
    const range = civilRange(providerEvent, timeZone);
    if (!providerEvent.id || !range) return [];
    const source = sourceFor(providerEvent, config.calendar.sources);
    const event: SafeCalendarEvent = {
      id: `calendar-${hash(providerEvent.calendarId || providerEvent.calendarName || 'unknown-calendar')}-${hash(providerEvent.id)}`,
      title: providerEvent.title || 'Untitled event',
      start: providerEvent.start,
      end: providerEvent.end,
      ...range,
      allDay: providerEvent.allDay ?? false,
      location: providerEvent.location ?? '',
      description: '',
      calendarUrl: config.calendar.presentationUrl ?? '',
      source,
    };
    const semantic = semanticFor(event, providerEvent.description ?? '', config.calendar.semanticRules);
    return [{ ...event, ...(semantic ? { semantic } : {}) }];
  });
  return {
    calendarUrl: config.calendar.presentationUrl ?? '',
    generatedAt: data.generatedAt ?? '',
    timeZone,
    events,
  };
}
