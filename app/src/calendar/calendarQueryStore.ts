import {
  CALENDAR_REFRESH_MS,
  getCalendarEvents,
  type CalendarData,
  type CalendarWindowRequest,
} from '../services/calendarService';
import {
  getCalendarHouseholdDate,
  shiftCalendarLocalDate,
  type ResolvedCalendarProfileAssignment,
} from './calendarModel';
import {
  getHouseholdConfig,
} from '../services/householdConfigService';

type CalendarLoader = (
  request: CalendarWindowRequest
) => Promise<CalendarData>;

type CalendarQueryListener = () => void;

type CalendarQuery = {
  key: string;
  request: CalendarWindowRequest;
  householdDate: string;
  currentWindow: boolean;
};

export type CalendarQuerySnapshot = {
  data: CalendarData | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  isFresh: boolean;
};

type CalendarQueryEntry = {
  query: CalendarQuery;
  data: CalendarData | null;
  error: string | null;
  inFlight: Promise<CalendarData> | null;
  lastSuccessAt: number | null;
  lastAttemptAt: number | null;
  loadedHouseholdDate: string | null;
  listeners: Set<CalendarQueryListener>;
  timer: ReturnType<typeof setTimeout> | null;
};

type CalendarQueryStoreOptions = {
  loadCalendar: CalendarLoader;
  timeZone: string;
  freshnessMs: number;
  now?: () => Date;
  schedule?: (
    callback: () => void,
    delayMs: number
  ) => ReturnType<typeof setTimeout>;
  cancel?: (
    timer: ReturnType<typeof setTimeout>
  ) => void;
};

export function canonicalCalendarQuery(
  request: CalendarWindowRequest,
  now: Date,
  timeZone: string
): CalendarQuery {
  const householdDate = getCalendarHouseholdDate(now, timeZone);
  const hasStart = request.startLocalDate !== undefined;

  if (!hasStart && request.days !== undefined) {
    throw new Error('Calendar start date is required.');
  }

  const startLocalDate = request.startLocalDate ?? householdDate;
  shiftCalendarLocalDate(startLocalDate, 0);

  const days = request.days ?? 7;
  if (!Number.isSafeInteger(days) || days < 1 || days > 42) {
    throw new Error('Calendar days must be between 1 and 42.');
  }

  const currentWindow = startLocalDate === householdDate && days === 7;

  return {
    key: currentWindow
      ? 'calendar:current:7'
      : `calendar:${startLocalDate}:${days}`,
    request: currentWindow
      ? {}
      : {
          startLocalDate,
          ...(days === 7 ? {} : { days }),
        },
    householdDate,
    currentWindow,
  };
}

export class CalendarQueryStore {
  private readonly loadCalendar: CalendarLoader;
  private readonly timeZone: string;
  private readonly freshnessMs: number;
  private readonly now: () => Date;
  private readonly scheduleTimer: CalendarQueryStoreOptions['schedule'];
  private readonly cancelTimer: CalendarQueryStoreOptions['cancel'];
  private readonly entries = new Map<string, CalendarQueryEntry>();

  constructor(options: CalendarQueryStoreOptions) {
    this.loadCalendar = options.loadCalendar;
    this.timeZone = options.timeZone;
    this.freshnessMs = options.freshnessMs;
    this.now = options.now ?? (() => new Date());
    this.scheduleTimer = options.schedule ?? ((callback, delayMs) =>
      globalThis.setTimeout(callback, delayMs));
    this.cancelTimer = options.cancel ?? (timer =>
      globalThis.clearTimeout(timer));
  }

  private query(request: CalendarWindowRequest): CalendarQuery {
    return canonicalCalendarQuery(request, this.now(), this.timeZone);
  }

  private entry(request: CalendarWindowRequest): CalendarQueryEntry {
    const query = this.query(request);
    const existing = this.entries.get(query.key);

    if (existing) {
      existing.query = query;
      return existing;
    }

    const entry: CalendarQueryEntry = {
      query,
      data: null,
      error: null,
      inFlight: null,
      lastSuccessAt: null,
      lastAttemptAt: null,
      loadedHouseholdDate: null,
      listeners: new Set(),
      timer: null,
    };
    this.entries.set(query.key, entry);
    return entry;
  }

  private boundaryChanged(entry: CalendarQueryEntry): boolean {
    return entry.query.currentWindow &&
      entry.loadedHouseholdDate !== null &&
      entry.loadedHouseholdDate !== getCalendarHouseholdDate(
        this.now(),
        this.timeZone
      );
  }

  private fresh(entry: CalendarQueryEntry): boolean {
    return entry.lastSuccessAt !== null &&
      this.now().getTime() - entry.lastSuccessAt < this.freshnessMs &&
      !this.boundaryChanged(entry);
  }

  private snapshot(entry: CalendarQueryEntry): CalendarQuerySnapshot {
    return {
      data: entry.data,
      loading: entry.data === null && entry.inFlight !== null,
      refreshing: entry.data !== null && entry.inFlight !== null,
      error: entry.error,
      isFresh: this.fresh(entry),
    };
  }

  getSnapshot(request: CalendarWindowRequest = {}): CalendarQuerySnapshot {
    return this.snapshot(this.entry(request));
  }

  private emit(entry: CalendarQueryEntry): void {
    for (const listener of entry.listeners) listener();
    this.schedule(entry);
  }

  private clearTimer(entry: CalendarQueryEntry): void {
    if (entry.timer === null) return;
    this.cancelTimer?.(entry.timer);
    entry.timer = null;
  }

  private schedule(entry: CalendarQueryEntry): void {
    this.clearTimer(entry);
    if (!entry.listeners.size || entry.inFlight || entry.data === null) return;

    const now = this.now().getTime();
    const lastReference = entry.error && entry.lastAttemptAt !== null
      ? entry.lastAttemptAt
      : entry.lastSuccessAt ?? now;
    const freshnessDelay = Math.max(
      0,
      lastReference + this.freshnessMs - now
    );
    const boundaryCheckDelay = entry.query.currentWindow
      ? Math.min(freshnessDelay, 60_000)
      : freshnessDelay;

    entry.timer = this.scheduleTimer?.(() => {
      entry.timer = null;
      if (entry.query.currentWindow) {
        entry.query = {
          ...entry.query,
          householdDate: getCalendarHouseholdDate(
            this.now(),
            this.timeZone
          ),
        };
      }

      const currentTime = this.now().getTime();
      const retryReference = entry.error && entry.lastAttemptAt !== null
        ? entry.lastAttemptAt
        : entry.lastSuccessAt ?? currentTime;
      const refreshDue = currentTime - retryReference >= this.freshnessMs;
      const boundaryDue = this.boundaryChanged(entry) && !entry.error;

      if (!refreshDue && !boundaryDue) {
        this.schedule(entry);
        return;
      }

      void this.load(entry).catch(() => undefined);
    }, boundaryCheckDelay) ?? null;
  }

  private load(entry: CalendarQueryEntry): Promise<CalendarData> {
    if (entry.inFlight) return entry.inFlight;

    this.clearTimer(entry);
    entry.error = null;
    entry.lastAttemptAt = this.now().getTime();

    const request = entry.query.request;
    const householdDate = entry.query.householdDate;
    const promise = this.loadCalendar(request)
      .then(data => {
        entry.data = data;
        entry.error = null;
        entry.lastSuccessAt = this.now().getTime();
        entry.loadedHouseholdDate = householdDate;
        return data;
      })
      .catch(error => {
        entry.error = 'Calendar unavailable';
        throw error;
      })
      .finally(() => {
        entry.inFlight = null;
        this.emit(entry);
      });

    entry.inFlight = promise;
    this.emit(entry);
    return promise;
  }

  ensure(request: CalendarWindowRequest = {}): Promise<CalendarData> {
    const entry = this.entry(request);
    if (entry.data && this.fresh(entry)) return Promise.resolve(entry.data);
    return this.load(entry);
  }

  read(request: CalendarWindowRequest = {}): Promise<CalendarData> {
    const entry = this.entry(request);
    if (!entry.data) return this.load(entry);

    if (!this.fresh(entry)) {
      void this.load(entry).catch(() => undefined);
    }
    return Promise.resolve(entry.data);
  }

  refresh(request: CalendarWindowRequest = {}): Promise<CalendarData> {
    return this.load(this.entry(request));
  }

  subscribe(
    request: CalendarWindowRequest,
    listener: CalendarQueryListener
  ): () => void {
    const entry = this.entry(request);
    entry.listeners.add(listener);
    this.schedule(entry);

    return () => {
      entry.listeners.delete(listener);
      if (!entry.listeners.size) this.clearTimer(entry);
    };
  }

  updateAssignment(
    eventKey: string,
    assignment: ResolvedCalendarProfileAssignment
  ): void {
    for (const entry of this.entries.values()) {
      if (!entry.data?.events.some(event => event.eventKey === eventKey)) {
        continue;
      }

      entry.data = {
        ...entry.data,
        events: entry.data.events.map(event =>
          event.eventKey === eventKey
            ? { ...event, profileAssignment: assignment }
            : event
        ),
      };
      entry.lastSuccessAt = null;
      this.emit(entry);
      if (entry.listeners.size) {
        void this.load(entry).catch(() => undefined);
      }
    }
  }

  invalidateEvent(eventKey: string): void {
    for (const entry of this.entries.values()) {
      if (!entry.data?.events.some(event => event.eventKey === eventKey)) {
        continue;
      }

      entry.lastSuccessAt = null;
      this.emit(entry);
      if (entry.listeners.size) {
        void this.load(entry).catch(() => undefined);
      }
    }
  }

  dispose(): void {
    for (const entry of this.entries.values()) this.clearTimer(entry);
    this.entries.clear();
  }
}

let sharedCalendarQueryStore: CalendarQueryStore | null = null;

export function getCalendarQueryStore(): CalendarQueryStore {
  if (!sharedCalendarQueryStore) {
    const config = getHouseholdConfig();
    sharedCalendarQueryStore = new CalendarQueryStore({
      loadCalendar: getCalendarEvents,
      timeZone: config.location.timezone,
      freshnessMs: CALENDAR_REFRESH_MS,
    });
  }

  return sharedCalendarQueryStore;
}

export function getSharedCalendarData(
  request: CalendarWindowRequest = {}
): Promise<CalendarData> {
  return getCalendarQueryStore().read(request);
}

export function prefetchCalendarWindow(
  request: CalendarWindowRequest = {}
): Promise<CalendarData> {
  return getCalendarQueryStore().ensure(request);
}

export function updateCachedCalendarAssignment(
  eventKey: string,
  assignment: ResolvedCalendarProfileAssignment
): void {
  getCalendarQueryStore().updateAssignment(eventKey, assignment);
}

export function invalidateCachedCalendarEvent(eventKey: string): void {
  getCalendarQueryStore().invalidateEvent(eventKey);
}

export function resetCalendarQueryStoreForTests(): void {
  sharedCalendarQueryStore?.dispose();
  sharedCalendarQueryStore = null;
}
