import { createHmac, randomUUID } from 'node:crypto';

import { getHouseholdConfig, getRuntimeAppMode } from '../config/householdConfig.js';
import {
  CALENDAR_EDIT_REVISION_PATTERN,
  CALENDAR_EVENT_KEY_PATTERN,
  calendarEditRegistry,
  type CalendarEditRevision,
  type CalendarProviderLocator,
} from './calendarEditRegistry.js';
import { parseV2ProviderEvent, type NormalizedProviderEvent } from './calendarProvider.js';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const RFC3339_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const HOUSEHOLD_TIME_ZONE = 'Europe/London';

export class CalendarWriteError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409 | 502,
    message: string,
    public readonly code?: string,
  ) { super(message); }
}

type DateTiming = { kind: 'date'; startDate: string; endDateExclusive: string };
type DateTimeTiming = { kind: 'dateTime'; start: string; end: string; timeZone: string };
export type CalendarEditRequest = {
  scope: 'event' | 'occurrence';
  revision: string;
  title: string;
  location: string;
  timing: DateTiming | DateTimeTiming;
};

export type SafeEditContext = {
  eventKey: string;
  revision: string;
  scope: 'event' | 'occurrence';
  recurring: boolean;
  title: string;
  location: string;
  timing: DateTiming | DateTimeTiming;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
}

function validDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match || Number(match[1]) < 1000) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

function householdParts(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: HOUSEHOLD_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (name: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === name)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

function validHouseholdDateTime(value: string): boolean {
  const match = RFC3339_PATTERN.exec(value);
  if (!match) return false;
  const instant = new Date(value);
  return !Number.isNaN(instant.getTime()) && householdParts(instant) === `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
}

function householdToday(now: Date): string { return householdParts(now).slice(0, 10); }

export function parseCalendarEditRequest(value: unknown, expectedAllDay: boolean, now = new Date()): CalendarEditRequest {
  if (!isRecord(value) || !exactKeys(value, ['scope', 'revision', 'title', 'location', 'timing']) || (value.scope !== 'event' && value.scope !== 'occurrence') || typeof value.revision !== 'string' || !CALENDAR_EDIT_REVISION_PATTERN.test(value.revision) || typeof value.title !== 'string' || value.title.trim().length < 1 || value.title.trim().length > 200 || typeof value.location !== 'string' || value.location.length > 500 || !isRecord(value.timing)) {
    throw new CalendarWriteError(400, 'Calendar edit request is invalid.');
  }
  const timing = value.timing;
  if (timing.kind === 'date') {
    if (!expectedAllDay || !exactKeys(timing, ['kind', 'startDate', 'endDateExclusive']) || typeof timing.startDate !== 'string' || typeof timing.endDateExclusive !== 'string' || !validDate(timing.startDate) || !validDate(timing.endDateExclusive) || timing.endDateExclusive <= timing.startDate || timing.startDate < householdToday(now)) throw new CalendarWriteError(400, 'Calendar edit timing is invalid.');
    const duration = (Date.parse(`${timing.endDateExclusive}T00:00:00Z`) - Date.parse(`${timing.startDate}T00:00:00Z`)) / 86_400_000;
    if (duration > 366) throw new CalendarWriteError(400, 'Calendar edit timing is invalid.');
    return { scope: value.scope, revision: value.revision, title: value.title.trim(), location: value.location.trim(), timing: { kind: 'date', startDate: timing.startDate, endDateExclusive: timing.endDateExclusive } };
  }
  if (timing.kind !== 'dateTime' || expectedAllDay || !exactKeys(timing, ['kind', 'start', 'end', 'timeZone']) || typeof timing.start !== 'string' || typeof timing.end !== 'string' || timing.timeZone !== HOUSEHOLD_TIME_ZONE || !validHouseholdDateTime(timing.start) || !validHouseholdDateTime(timing.end)) throw new CalendarWriteError(400, 'Calendar edit timing is invalid.');
  const start = new Date(timing.start);
  const end = new Date(timing.end);
  if (end <= start || end.getTime() - start.getTime() > 366 * 86_400_000 || householdParts(start).slice(0, 10) < householdToday(now)) throw new CalendarWriteError(400, 'Calendar edit timing is invalid.');
  return { scope: value.scope, revision: value.revision, title: value.title.trim(), location: value.location.trim(), timing: { kind: 'dateTime', start: timing.start, end: timing.end, timeZone: HOUSEHOLD_TIME_ZONE } };
}

function writeSecret(): string {
  const secret = process.env.EYOS_CALENDAR_WRITE_HMAC_SECRET?.trim();
  if (!secret || secret.length < 32) throw new CalendarWriteError(403, 'Calendar editing is not configured.');
  return secret;
}

function encode(value: string): string { return Buffer.from(value, 'utf8').toString('base64url'); }

async function callProducer(operation: 'inspect-event' | 'update-event', locator: CalendarProviderLocator, body: Record<string, unknown>, fetcher: typeof fetch): Promise<NormalizedProviderEvent> {
  const config = getHouseholdConfig();
  const payload = encode(JSON.stringify({ version: 1, requestId: randomUUID(), issuedAt: new Date().toISOString(), operation, locator: { calendarId: locator.calendarId, providerEventId: locator.providerEventId }, body }));
  const signature = createHmac('sha256', writeSecret()).update(payload, 'utf8').digest('base64url');
  let response: Response;
  try {
    response = await fetcher(config.calendar.endpoint, { method: 'POST', redirect: 'follow', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ payload, signature }) });
  } catch { throw new CalendarWriteError(502, 'Calendar provider update failed.'); }
  let result: unknown;
  try { result = await response.json(); } catch { throw new CalendarWriteError(502, 'Calendar provider update failed.'); }
  if (!isRecord(result) || result.success !== true || !isRecord(result.event)) {
    const code = isRecord(result) && typeof result.code === 'string' ? result.code : '';
    if (code === 'NOT_PERMITTED') throw new CalendarWriteError(403, 'Calendar event is not editable.');
    if (code === 'NOT_FOUND') throw new CalendarWriteError(404, 'Calendar event no longer exists.');
    if (code === 'PRECONDITION_FAILED') throw new CalendarWriteError(409, 'Calendar event changed. Load the latest version.', 'CALENDAR_EVENT_CHANGED');
    throw new CalendarWriteError(502, 'Calendar provider update failed.');
  }
  const event = parseV2ProviderEvent(result.event);
  if (event.eventKey !== locator.eventKey || event.calendarId !== locator.calendarId || event.providerEventId !== locator.providerEventId || event.status === 'cancelled') throw new CalendarWriteError(502, 'Calendar provider identity verification failed.');
  return event;
}

function assertEligible(eventKey: string): CalendarProviderLocator {
  if (getRuntimeAppMode() !== 'household' || !CALENDAR_EVENT_KEY_PATTERN.test(eventKey)) throw new CalendarWriteError(403, 'Calendar event is not editable.');
  const locator = calendarEditRegistry.resolve(eventKey);
  if (!locator) throw new CalendarWriteError(409, 'Calendar event must be reloaded before editing.');
  const source = getHouseholdConfig().calendar.sources.find(item => item.sourceId === locator.sourceId);
  if (!source || source.writeAccess !== 'edit-existing') throw new CalendarWriteError(403, 'Calendar event is not editable.');
  return locator;
}

function contextFrom(event: NormalizedProviderEvent, revision: string): SafeEditContext {
  const recurring = event.recurringEventId !== null;
  return {
    eventKey: event.eventKey,
    revision,
    scope: recurring ? 'occurrence' : 'event',
    recurring,
    title: event.title,
    location: event.location,
    timing: event.allDay
      ? { kind: 'date', startDate: event.start, endDateExclusive: event.end }
      : { kind: 'dateTime', start: event.start, end: event.end, timeZone: HOUSEHOLD_TIME_ZONE },
  };
}

export async function getCalendarEditContext(eventKey: string, fetcher: typeof fetch = fetch): Promise<SafeEditContext> {
  const locator = assertEligible(eventKey);
  const event = await callProducer('inspect-event', locator, {}, fetcher);
  if (!event.writable || !event.etag || event.allDay !== locator.allDay || Boolean(event.recurringEventId) !== Boolean(locator.recurringEventId)) throw new CalendarWriteError(403, 'Calendar event is not editable.');
  const refreshed: CalendarProviderLocator = { ...locator, providerEventId: event.providerEventId!, recurringEventId: event.recurringEventId, originalStartTime: event.originalStartTime, allDay: event.allDay, providerEtag: event.etag };
  calendarEditRegistry.register(refreshed);
  return contextFrom(event, calendarEditRegistry.issue(refreshed, event.etag));
}

function updateBody(revision: CalendarEditRevision, request: CalendarEditRequest): Record<string, unknown> {
  return {
    etag: revision.expectedEtag,
    scope: request.scope,
    title: request.title,
    location: request.location,
    timing: request.timing,
  };
}

export async function updateCalendarEvent(eventKey: string, rawRequest: unknown, fetcher: typeof fetch = fetch, now = new Date()): Promise<SafeEditContext> {
  const locator = assertEligible(eventKey);
  if (!isRecord(rawRequest) || typeof rawRequest.revision !== 'string') throw new CalendarWriteError(400, 'Calendar edit request is invalid.');
  const revision = calendarEditRegistry.consume(rawRequest.revision, eventKey);
  if (!revision) throw new CalendarWriteError(409, 'Calendar edit context expired. Load the latest version.');
  const request = parseCalendarEditRequest(rawRequest, revision.allDay, now);
  if (request.scope !== revision.scope || locator.calendarId !== revision.calendarId || locator.providerEventId !== revision.providerEventId) throw new CalendarWriteError(400, 'Calendar edit scope is invalid.');
  const event = await callProducer('update-event', revision, updateBody(revision, request), fetcher);
  if (event.allDay !== revision.allDay || Boolean(event.recurringEventId) !== Boolean(revision.recurringEventId) || !event.etag) throw new CalendarWriteError(502, 'Calendar provider identity verification failed.');
  const refreshed: CalendarProviderLocator = { ...revision, providerEventId: event.providerEventId!, recurringEventId: event.recurringEventId, originalStartTime: event.originalStartTime, allDay: event.allDay, providerEtag: event.etag };
  calendarEditRegistry.register(refreshed);
  return contextFrom(event, calendarEditRegistry.issue(refreshed, event.etag));
}
