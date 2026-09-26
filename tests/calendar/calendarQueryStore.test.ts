import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CalendarQueryStore,
  canonicalCalendarQuery,
} from '../../app/src/calendar/calendarQueryStore';
import type {
  CalendarData,
  CalendarWindowRequest,
} from '../../app/src/services/calendarService';

const TIME_ZONE = 'Europe/London';
const NOW = new Date('2026-09-26T12:00:00.000Z');
const EVENT_KEY = `calendar-event-v1-${'a'.repeat(64)}`;

function calendarData(
  title: string,
  assignment = {
    target: { kind: 'unassigned' as const },
    basis: 'none' as const,
  }
): CalendarData {
  return {
    calendarUrl: '',
    generatedAt: NOW.toISOString(),
    timeZone: TIME_ZONE,
    events: [{
      id: EVENT_KEY,
      eventKey: EVENT_KEY,
      title,
      start: '2026-09-26T09:00:00+01:00',
      end: '2026-09-26T10:00:00+01:00',
      startLocalDate: '2026-09-26',
      endLocalDateExclusive: '2026-09-27',
      allDay: false,
      location: '',
      description: '',
      writable: true,
      calendarUrl: '',
      source: { id: 'family', label: 'Family', kind: 'family' },
      profileAssignment: assignment,
    }],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function store(
  loader: (request: CalendarWindowRequest) => Promise<CalendarData>,
  clock: { now: Date }
) {
  return new CalendarQueryStore({
    loadCalendar: loader,
    timeZone: TIME_ZONE,
    freshnessMs: 15 * 60_000,
    now: () => new Date(clock.now),
    schedule: () => 0,
    cancel: () => undefined,
  });
}

describe('shared Calendar query store', () => {
  it('canonicalises default and explicit household-today seven-day windows', () => {
    const defaultQuery = canonicalCalendarQuery({}, NOW, TIME_ZONE);
    const explicitQuery = canonicalCalendarQuery(
      { startLocalDate: '2026-09-26', days: 7 },
      NOW,
      TIME_ZONE
    );

    assert.equal(defaultQuery.key, 'calendar:current:7');
    assert.equal(explicitQuery.key, defaultQuery.key);
    assert.deepEqual(defaultQuery.request, {});
    assert.deepEqual(explicitQuery.request, {});
  });

  it('deduplicates simultaneous equivalent consumers into one request', async () => {
    const clock = { now: NOW };
    const pending = deferred<CalendarData>();
    const requests: CalendarWindowRequest[] = [];
    const queryStore = store(request => {
      requests.push(request);
      return pending.promise;
    }, clock);

    const first = queryStore.ensure({});
    const second = queryStore.ensure({
      startLocalDate: '2026-09-26',
      days: 7,
    });

    assert.equal(requests.length, 1);
    assert.strictEqual(first, second);
    pending.resolve(calendarData('Shared'));
    await Promise.all([first, second]);
    assert.equal(queryStore.getSnapshot({}).data?.events[0].title, 'Shared');
  });

  it('retains a successful fresh result across unsubscribe and remount', async () => {
    const clock = { now: NOW };
    let requests = 0;
    const queryStore = store(async () => {
      requests += 1;
      return calendarData('Retained');
    }, clock);
    const unsubscribe = queryStore.subscribe({}, () => undefined);

    await queryStore.ensure({});
    unsubscribe();
    const remounted = queryStore.subscribe({}, () => undefined);
    await queryStore.ensure({ startLocalDate: '2026-09-26' });

    assert.equal(requests, 1);
    assert.equal(queryStore.getSnapshot({}).data?.events[0].title, 'Retained');
    remounted();
  });

  it('lets an explicit refresh bypass the freshness period', async () => {
    const clock = { now: NOW };
    let requests = 0;
    const queryStore = store(async () => {
      requests += 1;
      return calendarData(`Request ${requests}`);
    }, clock);

    await queryStore.ensure({});
    await queryStore.refresh({});

    assert.equal(requests, 2);
    assert.equal(
      queryStore.getSnapshot({}).data?.events[0].title,
      'Request 2'
    );
  });

  it('shows stale data while exactly one background refresh runs', async () => {
    const clock = { now: NOW };
    const refresh = deferred<CalendarData>();
    let requests = 0;
    const queryStore = store(async () => {
      requests += 1;
      return requests === 1 ? calendarData('Old') : refresh.promise;
    }, clock);

    await queryStore.ensure({});
    clock.now = new Date(NOW.getTime() + 16 * 60_000);

    const firstRefresh = queryStore.ensure({});
    const secondRefresh = queryStore.ensure({ startLocalDate: '2026-09-26' });
    const duringRefresh = queryStore.getSnapshot({});

    assert.equal(requests, 2);
    assert.strictEqual(firstRefresh, secondRefresh);
    assert.equal(duringRefresh.data?.events[0].title, 'Old');
    assert.equal(duringRefresh.refreshing, true);
    assert.equal(duringRefresh.loading, false);

    refresh.resolve(calendarData('New'));
    await firstRefresh;
    assert.equal(queryStore.getSnapshot({}).data?.events[0].title, 'New');
  });

  it('returns stale data immediately to non-React consumers while revalidating', async () => {
    const clock = { now: NOW };
    const refresh = deferred<CalendarData>();
    let requests = 0;
    const queryStore = store(async () => {
      requests += 1;
      return requests === 1 ? calendarData('Cached') : refresh.promise;
    }, clock);

    await queryStore.ensure({});
    clock.now = new Date(NOW.getTime() + 16 * 60_000);

    const stale = await queryStore.read({});
    assert.equal(stale.events[0].title, 'Cached');
    assert.equal(requests, 2);
    assert.equal(queryStore.getSnapshot({}).refreshing, true);

    refresh.resolve(calendarData('Refreshed'));
    await queryStore.ensure({});
  });

  it('retains last-successful data when background refresh fails', async () => {
    const clock = { now: NOW };
    let requests = 0;
    const queryStore = store(async () => {
      requests += 1;
      if (requests === 1) return calendarData('Last success');
      throw new Error('Provider unavailable');
    }, clock);

    await queryStore.ensure({});
    clock.now = new Date(NOW.getTime() + 16 * 60_000);
    await assert.rejects(queryStore.ensure({}), /Provider unavailable/);

    const snapshot = queryStore.getSnapshot({});
    assert.equal(snapshot.data?.events[0].title, 'Last success');
    assert.equal(snapshot.error, 'Calendar unavailable');
    assert.equal(snapshot.loading, false);
  });

  it('revalidates the canonical current window across a household-local date boundary', async () => {
    const clock = { now: new Date('2026-09-26T22:58:00.000Z') };
    const nextDay = deferred<CalendarData>();
    let requests = 0;
    const queryStore = store(async () => {
      requests += 1;
      return requests === 1 ? calendarData('Saturday') : nextDay.promise;
    }, clock);

    await queryStore.ensure({});
    clock.now = new Date('2026-09-26T23:01:00.000Z');
    const refresh = queryStore.ensure({});

    assert.equal(requests, 2);
    assert.equal(queryStore.getSnapshot({}).data?.events[0].title, 'Saturday');
    assert.equal(queryStore.getSnapshot({}).refreshing, true);

    nextDay.resolve(calendarData('Sunday'));
    await refresh;
    assert.equal(queryStore.getSnapshot({}).data?.events[0].title, 'Sunday');
  });

  it('isolates different Calendar windows', async () => {
    const clock = { now: NOW };
    const requests: CalendarWindowRequest[] = [];
    const queryStore = store(async request => {
      requests.push(request);
      return calendarData(request.startLocalDate ?? 'Current');
    }, clock);

    await Promise.all([
      queryStore.ensure({}),
      queryStore.ensure({ startLocalDate: '2026-10-03' }),
      queryStore.ensure({ startLocalDate: '2026-10-01', days: 35 }),
    ]);

    assert.equal(requests.length, 3);
    assert.equal(
      queryStore.getSnapshot({ startLocalDate: '2026-10-03' })
        .data?.events[0].title,
      '2026-10-03'
    );
    assert.equal(
      queryStore.getSnapshot({ startLocalDate: '2026-10-01', days: 35 })
        .data?.events[0].title,
      '2026-10-01'
    );
  });

  it('updates assignments immediately and makes affected cached windows stale', async () => {
    const clock = { now: NOW };
    const queryStore = store(async () => calendarData('Assigned'), clock);
    await queryStore.ensure({});

    queryStore.updateAssignment(EVENT_KEY, {
      target: { kind: 'members', profileIds: ['child'] },
      basis: 'explicit',
    });

    const snapshot = queryStore.getSnapshot({});
    assert.deepEqual(snapshot.data?.events[0].profileAssignment, {
      target: { kind: 'members', profileIds: ['child'] },
      basis: 'explicit',
    });
    assert.equal(snapshot.isFresh, false);
  });

  it('invalidates every cached window containing an updated event', async () => {
    const clock = { now: NOW };
    const queryStore = store(async () => calendarData('Before edit'), clock);
    await Promise.all([
      queryStore.ensure({}),
      queryStore.ensure({ startLocalDate: '2026-10-03' }),
    ]);

    queryStore.invalidateEvent(EVENT_KEY);

    assert.equal(queryStore.getSnapshot({}).isFresh, false);
    assert.equal(
      queryStore.getSnapshot({ startLocalDate: '2026-10-03' }).isFresh,
      false
    );
  });
});
