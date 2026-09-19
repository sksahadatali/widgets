import { createHash } from 'node:crypto';
import { getHouseholdConfig, type CalendarSemanticRule, type CalendarSourceConfig } from '../config/householdConfig.js';
type Temporal = {
    kind: 'date';
    value: string;
} | {
    kind: 'dateTime';
    value: string;
    timeZone?: string;
};
type NormalizedProviderEvent = {
    eventKey: string;
    title: string;
    start: string;
    end: string;
    allDay: boolean;
    location: string;
    description: string;
    status: string;
    writable: boolean;
    calendarId: string;
    calendarName: string;
};
type Semantic = {
    kind: CalendarSemanticRule['kind'];
    label?: string;
};
export type SafeCalendarEvent = {
    id: string;
    eventKey: string;
    title: string;
    start: string;
    end: string;
    startLocalDate: string;
    endLocalDateExclusive: string;
    allDay: boolean;
    location: string;
    description: string;
    status: string;
    writable: boolean;
    calendarUrl: string;
    source: {
        id: string;
        label: string;
        kind: string;
    };
    semantic?: Semantic;
};
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const PROVIDER = 'google-calendar';
const EVENT_KEY_PREFIX = 'calendar-event-v1-';
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function nonEmptyString(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function nullableString(value: unknown): value is string | null { return value === null || typeof value === 'string'; }
function nullableNonEmptyString(value: unknown): value is string | null { return value === null || nonEmptyString(value); }
function isValidDate(value: string): boolean {
    const match = DATE_PATTERN.exec(value);
    if (!match)
        return false;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}
function isValidRfc3339(value: string): boolean { return RFC3339_PATTERN.test(value) && !Number.isNaN(new Date(value).getTime()); }
function temporal(value: unknown): Temporal {
    if (!isRecord(value) || (value.kind !== 'date' && value.kind !== 'dateTime') || !nonEmptyString(value.value))
        throw new Error('Calendar provider temporal value is invalid.');
    if (value.kind === 'date') {
        if (!isValidDate(value.value))
            throw new Error('Calendar provider date is invalid.');
        return { kind: 'date', value: value.value };
    }
    if (!isValidRfc3339(value.value) || (value.timeZone !== undefined && !nonEmptyString(value.timeZone)))
        throw new Error('Calendar provider date-time is invalid.');
    return { kind: 'dateTime', value: value.value, ...(typeof value.timeZone === 'string' ? { timeZone: value.timeZone } : {}) };
}
function shiftDate(value: string, days: number): string {
    const match = DATE_PATTERN.exec(value);
    if (!match)
        throw new Error('Invalid Calendar date.');
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
function zonedParts(value: string, timeZone: string): {
    date: string;
    atMidnight: boolean;
} | null {
    if (isValidDate(value))
        return { date: value, atMidnight: true };
    if (!isValidRfc3339(value))
        return null;
    try {
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
        const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
        return { date: `${get('year')}-${get('month')}-${get('day')}`, atMidnight: get('hour') === '00' && get('minute') === '00' && get('second') === '00' };
    }
    catch {
        return null;
    }
}
function civilRange(event: NormalizedProviderEvent, timeZone: string) {
    const start = zonedParts(event.start, timeZone);
    const end = zonedParts(event.end, timeZone);
    if (!start)
        return null;
    if (event.allDay) {
        const endDate = end?.date ?? shiftDate(start.date, 1);
        return { startLocalDate: start.date, endLocalDateExclusive: endDate > start.date ? endDate : shiftDate(start.date, 1) };
    }
    const exclusive = end ? (end.atMidnight ? end.date : shiftDate(end.date, 1)) : shiftDate(start.date, 1);
    return { startLocalDate: start.date, endLocalDateExclusive: exclusive > start.date ? exclusive : shiftDate(start.date, 1) };
}
function legacyHash(value: string): string {
    let result = 14695981039346656037n;
    for (let index = 0; index < value.length; index += 1) {
        result ^= BigInt(value.charCodeAt(index));
        result = BigInt.asUintN(64, result * 1099511628211n);
    }
    return result.toString(16).padStart(16, '0');
}
function opaqueEventKey(identity: readonly string[]): string { return `${EVENT_KEY_PREFIX}${createHash('sha256').update(JSON.stringify(identity), 'utf8').digest('hex')}`; }
function originalStartIdentity(value: Temporal): string { return value.kind === 'date' ? `date:${value.value}` : `dateTime:${new Date(value.value).toISOString()}`; }
function parseV2Event(value: unknown): NormalizedProviderEvent {
    if (!isRecord(value) || value.identityVersion !== 1 || value.provider !== PROVIDER || !nonEmptyString(value.providerEventId) || !nonEmptyString(value.calendarId) || !nullableNonEmptyString(value.recurringEventId) || !nullableString(value.iCalUID) || !nullableString(value.etag) || !nullableString(value.updated) || !['confirmed', 'tentative', 'cancelled'].includes(String(value.status)) || typeof value.writable !== 'boolean' || typeof value.calendarName !== 'string' || typeof value.title !== 'string' || typeof value.allDay !== 'boolean' || typeof value.location !== 'string' || typeof value.description !== 'string')
        throw new Error('Calendar provider v2 event is invalid.');
    if (value.updated !== null && !isValidRfc3339(value.updated))
        throw new Error('Calendar provider updated timestamp is invalid.');
    const start = temporal(value.start);
    const end = temporal(value.end);
    if ((value.allDay && (start.kind !== 'date' || end.kind !== 'date')) || (!value.allDay && (start.kind !== 'dateTime' || end.kind !== 'dateTime')))
        throw new Error('Calendar provider all-day semantics are invalid.');
    const originalStart = value.originalStartTime === null ? null : temporal(value.originalStartTime);
    if ((value.recurringEventId === null) !== (originalStart === null))
        throw new Error('Calendar recurring occurrence identity is incomplete.');
    if (originalStart && originalStart.kind !== start.kind)
        throw new Error('Calendar recurring occurrence identity type is invalid.');
    if ((start.kind === 'date' && end.value <= start.value) || (start.kind === 'dateTime' && new Date(end.value).getTime() <= new Date(start.value).getTime()))
        throw new Error('Calendar provider event range is invalid.');
    const identity = value.recurringEventId === null
        ? ['event-identity-v1', PROVIDER, value.calendarId, value.providerEventId]
        : ['event-identity-v1', PROVIDER, value.calendarId, value.recurringEventId, originalStartIdentity(originalStart!)];
    return { eventKey: opaqueEventKey(identity), title: value.title || 'Untitled event', start: start.value, end: end.value, allDay: value.allDay, location: value.location, description: value.description, status: String(value.status), writable: value.writable, calendarId: value.calendarId, calendarName: value.calendarName };
}
function parseV1Event(value: unknown): NormalizedProviderEvent {
    if (!isRecord(value) || !nonEmptyString(value.id) || typeof value.title !== 'string' || !nonEmptyString(value.start) || !nonEmptyString(value.end) || (value.allDay !== undefined && typeof value.allDay !== 'boolean') || (value.location !== undefined && typeof value.location !== 'string') || (value.description !== undefined && typeof value.description !== 'string') || (value.calendarId !== undefined && typeof value.calendarId !== 'string') || (value.calendarName !== undefined && typeof value.calendarName !== 'string') || (value.status !== undefined && typeof value.status !== 'string') || (value.writable !== undefined && typeof value.writable !== 'boolean'))
        throw new Error('Calendar provider v1 event is invalid.');
    const calendarId = typeof value.calendarId === 'string' ? value.calendarId : '';
    const calendarName = typeof value.calendarName === 'string' ? value.calendarName : '';
    const source = calendarId || calendarName || 'unknown-calendar';
    return { eventKey: `calendar-${legacyHash(source)}-${legacyHash(value.id)}`, title: value.title || 'Untitled event', start: value.start, end: value.end, allDay: value.allDay === true, location: typeof value.location === 'string' ? value.location : '', description: typeof value.description === 'string' ? value.description : '', status: typeof value.status === 'string' ? value.status : 'confirmed', writable: value.writable === true, calendarId, calendarName };
}
function timeZone(value: unknown): string {
    if (!nonEmptyString(value))
        throw new Error('Calendar provider timezone is invalid.');
    try {
        new Intl.DateTimeFormat('en-GB', { timeZone: value }).format();
    }
    catch {
        throw new Error('Calendar provider timezone is invalid.');
    }
    return value;
}
function providerResponse(value: unknown, fallbackTimeZone: string) {
    if (!isRecord(value) || value.success !== true || !Array.isArray(value.events))
        throw new Error('Calendar provider returned an invalid response.');
    if (value.generatedAt !== undefined && (!nonEmptyString(value.generatedAt) || !isValidRfc3339(value.generatedAt)))
        throw new Error('Calendar provider generated timestamp is invalid.');
    if (value.contractVersion === 2) {
        if (value.provider !== PROVIDER || !nonEmptyString(value.generatedAt) || !isRecord(value.window) || !isValidDate(String(value.window.startDate)) || !isValidDate(String(value.window.endDateExclusive)) || String(value.window.endDateExclusive) <= String(value.window.startDate) || !isValidRfc3339(String(value.window.timeMin)) || !isValidRfc3339(String(value.window.timeMax)) || new Date(String(value.window.timeMax)).getTime() <= new Date(String(value.window.timeMin)).getTime() || typeof value.calendarUrl !== 'string')
            throw new Error('Calendar provider v2 response is invalid.');
        return { generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : '', timeZone: timeZone(value.timeZone), events: value.events.map(parseV2Event) };
    }
    if (value.contractVersion !== undefined && value.contractVersion !== 1)
        throw new Error('Calendar provider contract version is unsupported.');
    return { generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : '', timeZone: value.timeZone === undefined ? fallbackTimeZone : timeZone(value.timeZone), events: value.events.map(parseV1Event) };
}
function sourceFor(event: NormalizedProviderEvent, sources: readonly CalendarSourceConfig[]) {
    const calendarId = event.calendarId.trim();
    const calendarName = event.calendarName.trim();
    const source = sources.find(item => (item.calendarId && item.calendarId === calendarId) || (item.calendarName && item.calendarName === calendarName));
    return source ? { id: source.sourceId, label: source.label, kind: source.kind } : { id: `calendar-${legacyHash(calendarId || calendarName || 'unknown-calendar')}`, label: 'Calendar', kind: 'calendar' };
}
function marker(description: string): Semantic | null | 'invalid' {
    const lines = description.split(/\r?\n/).map(line => line.trim()).filter(line => /^eyos\.(kind|label)\b/i.test(line));
    if (!lines.length)
        return null;
    const kinds = lines.filter(line => line.startsWith('eyos.kind='));
    const labels = lines.filter(line => line.startsWith('eyos.label='));
    if (kinds.length !== 1 || labels.length > 1 || lines.length !== kinds.length + labels.length)
        return 'invalid';
    const kind = kinds[0].slice(10).trim();
    if (!['school.training-day', 'school.holiday', 'school.reopens'].includes(kind))
        return 'invalid';
    const label = labels[0]?.slice(11).trim();
    if (labels.length && (!label || label.length > 80))
        return 'invalid';
    return { kind: kind as Semantic['kind'], ...(label ? { label } : {}) };
}
function semanticFor(event: SafeCalendarEvent, description: string, rules: readonly CalendarSemanticRule[]): Semantic | undefined {
    if (event.source.kind !== 'school')
        return undefined;
    const parsed = marker(description);
    if (parsed === 'invalid')
        return undefined;
    if (parsed)
        return parsed;
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
    if (!response.ok)
        throw new Error('Calendar provider request failed.');
    const data = providerResponse(await response.json(), config.location.timezone);
    const events = data.events.map(providerEvent => {
        const range = civilRange(providerEvent, data.timeZone);
        if (!range)
            throw new Error('Calendar provider event range is invalid.');
        const source = sourceFor(providerEvent, config.calendar.sources);
        const event: SafeCalendarEvent = { id: providerEvent.eventKey, eventKey: providerEvent.eventKey, title: providerEvent.title, start: providerEvent.start, end: providerEvent.end, ...range, allDay: providerEvent.allDay, location: providerEvent.location, description: '', status: providerEvent.status, writable: providerEvent.writable, calendarUrl: config.calendar.presentationUrl ?? '', source };
        const semantic = semanticFor(event, providerEvent.description, config.calendar.semanticRules);
        return { ...event, ...(semantic ? { semantic } : {}) };
    });
    return { calendarUrl: config.calendar.presentationUrl ?? '', generatedAt: data.generatedAt, timeZone: data.timeZone, events };
}
