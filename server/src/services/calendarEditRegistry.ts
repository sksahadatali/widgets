import { randomBytes } from 'node:crypto';

export const CALENDAR_EVENT_KEY_PATTERN = /^calendar-event-v1-[a-f0-9]{64}$/;
export const CALENDAR_EDIT_REVISION_PATTERN = /^calendar-edit-revision-v1-[a-f0-9]{64}$/;

export type ProviderTemporal =
  | { kind: 'date'; value: string }
  | { kind: 'dateTime'; value: string; timeZone?: string };

export type CalendarProviderLocator = {
  provider: 'google-calendar';
  eventKey: string;
  sourceId: string;
  calendarId: string;
  providerEventId: string;
  recurringEventId: string | null;
  originalStartTime: ProviderTemporal | null;
  allDay: boolean;
  providerEtag: string;
};

type Expiring<T> = { value: T; expiresAt: number };
export type CalendarEditRevision = CalendarProviderLocator & {
  scope: 'event' | 'occurrence';
  expectedEtag: string;
};

export class CalendarEditRegistry {
  private readonly locators = new Map<string, Expiring<CalendarProviderLocator>>();
  private readonly revisions = new Map<string, Expiring<CalendarEditRevision>>();

  constructor(
    private readonly locatorTtlMs = 20 * 60_000,
    private readonly revisionTtlMs = 10 * 60_000,
    private readonly maxLocators = 500,
    private readonly maxRevisions = 200,
  ) {}

  private expire<T>(map: Map<string, Expiring<T>>, now: number): void {
    for (const [key, item] of map) if (item.expiresAt <= now) map.delete(key);
  }

  private makeRoom<T>(map: Map<string, Expiring<T>>, limit: number): void {
    while (map.size >= limit) map.delete(map.keys().next().value as string);
  }

  register(locator: CalendarProviderLocator, now = Date.now()): void {
    this.expire(this.locators, now);
    this.locators.delete(locator.eventKey);
    this.makeRoom(this.locators, this.maxLocators);
    this.locators.set(locator.eventKey, { value: { ...locator }, expiresAt: now + this.locatorTtlMs });
  }

  resolve(eventKey: string, now = Date.now()): CalendarProviderLocator | null {
    if (!CALENDAR_EVENT_KEY_PATTERN.test(eventKey)) return null;
    this.expire(this.locators, now);
    const item = this.locators.get(eventKey);
    return item && item.expiresAt > now ? { ...item.value } : null;
  }

  issue(locator: CalendarProviderLocator, etag: string, now = Date.now()): string {
    this.expire(this.revisions, now);
    this.makeRoom(this.revisions, this.maxRevisions);
    const revision = `calendar-edit-revision-v1-${randomBytes(32).toString('hex')}`;
    this.revisions.set(revision, {
      value: { ...locator, scope: locator.recurringEventId ? 'occurrence' : 'event', expectedEtag: etag },
      expiresAt: now + this.revisionTtlMs,
    });
    return revision;
  }

  consume(revision: string, eventKey: string, now = Date.now()): CalendarEditRevision | null {
    if (!CALENDAR_EDIT_REVISION_PATTERN.test(revision) || !CALENDAR_EVENT_KEY_PATTERN.test(eventKey)) return null;
    this.expire(this.revisions, now);
    const item = this.revisions.get(revision);
    this.revisions.delete(revision);
    return item && item.expiresAt > now && item.value.eventKey === eventKey ? { ...item.value } : null;
  }

  clear(): void {
    this.locators.clear();
    this.revisions.clear();
  }
}

export const calendarEditRegistry = new CalendarEditRegistry();
