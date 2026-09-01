import assert from 'node:assert/strict';
import {
  after,
  before,
  describe,
  it,
} from 'node:test';
import {
  fileURLToPath,
} from 'node:url';

import {
  createServer,
  type ViteDevServer,
} from 'vite';

import type {
  CalendarEvent,
} from '../../app/src/calendar/calendarModel.ts';

const originalFetch = globalThis.fetch;
const originalAppMode = process.env.VITE_EY_MODE;
const APP_ROOT = fileURLToPath(
  new URL('../../app', import.meta.url)
);

type BriefServiceModule =
  typeof import('../../app/src/services/briefService.ts');
type GoogleMapsServiceModule =
  typeof import('../../app/src/services/googleMapsService.ts');

let testServer: ViteDevServer;
let buildTodaysBrief:
  BriefServiceModule['buildTodaysBrief'];
let refreshTravelInfoIfNeeded:
  GoogleMapsServiceModule['refreshTravelInfoIfNeeded'];

before(async () => {
  process.env.VITE_EY_MODE = 'demo';

  testServer = await createServer({
    root: APP_ROOT,
    mode: 'test',
    appType: 'custom',
    logLevel: 'error',
    server: {
      middlewareMode: true,
    },
  });

  const briefService = await testServer.ssrLoadModule(
    '/src/services/briefService.ts'
  ) as BriefServiceModule;
  const googleMapsService = await testServer.ssrLoadModule(
    '/src/services/googleMapsService.ts'
  ) as GoogleMapsServiceModule;

  buildTodaysBrief = briefService.buildTodaysBrief;
  refreshTravelInfoIfNeeded =
    googleMapsService.refreshTravelInfoIfNeeded;
});

after(async () => {
  globalThis.fetch = originalFetch;

  if (originalAppMode === undefined) {
    delete process.env.VITE_EY_MODE;
  } else {
    process.env.VITE_EY_MODE = originalAppMode;
  }

  await testServer.close();
});

function event(
  id: string,
  title: string,
  options: {
    allDay?: boolean;
    location?: string;
    start?: string;
    end?: string;
  } = {}
): CalendarEvent {
  return {
    id,
    title,
    start: options.start ?? '2099-08-30',
    end: options.end ?? '2099-08-31',
    startLocalDate: '2099-08-30',
    endLocalDateExclusive: '2099-08-31',
    allDay: options.allDay ?? true,
    location: options.location ?? '',
    description: '',
    calendarUrl: 'https://example.invalid/calendar',
    source: {
      id: 'calendar-example',
      label: 'Calendar',
      kind: 'calendar',
    },
  };
}

function build(
  todayEvents: CalendarEvent[],
  schoolInsight: {
    text: string;
    consumedEventIds: string[];
  } | null
) {
  return buildTodaysBrief({
    weather: null,
    prayer: null,
    todayEvents,
    nest: null,
    schoolInsight,
  });
}

describe("Today's Brief School candidate integration", () => {
  it('admits a School transition candidate', () => {
    const result = build([], {
      text: 'School reopens tomorrow',
      consumedEventIds: ['school-event'],
    });

    assert.equal(
      result.items[0],
      'School reopens tomorrow'
    );
  });

  it('ranks School above the ordinary Calendar candidate', () => {
    const result = build(
      [event('family-event', 'Family appointment')],
      {
        text: 'School reopens tomorrow',
        consumedEventIds: ['school-event'],
      }
    );

    assert.deepEqual(result.items.slice(0, 2), [
      'School reopens tomorrow',
      'Family appointment is scheduled for today.',
    ]);
  });

  it('suppresses the consumed generic Calendar duplicate', () => {
    const result = build(
      [event('school-event', 'Training Day')],
      {
        text: 'School closed today — Training Day',
        consumedEventIds: ['school-event'],
      }
    );

    assert.deepEqual(result.items, [
      'School closed today — Training Day',
    ]);
  });

  it('keeps an unrelated Calendar event eligible', () => {
    const result = build(
      [
        event('school-event', 'Training Day'),
        event('family-event', 'Family appointment'),
      ],
      {
        text: 'School closed today — Training Day',
        consumedEventIds: ['school-event'],
      }
    );

    assert.ok(
      result.items.includes(
        'Family appointment is scheduled for today.'
      )
    );
  });

  it('preserves travel selection from the original event collection', async () => {
    const meetingTime = new Date(
      Date.now() + 90 * 60 * 1000
    );

    globalThis.fetch = async (_input, init) => {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        destination: 'Example destination',
      });
      return new Response(JSON.stringify({
        travelMinutes: 20,
        distanceKm: 5,
      }));
    };

    await refreshTravelInfoIfNeeded(
      'Example destination',
      meetingTime
    );

    const travelEvent = event(
      'travel-event',
      'Appointment',
      {
        allDay: false,
        location: 'Example destination',
        start: meetingTime.toISOString(),
        end: new Date(
          meetingTime.getTime() + 60 * 60 * 1000
        ).toISOString(),
      }
    );
    const result = build(
      [travelEvent],
      {
        text: 'School reopens tomorrow',
        consumedEventIds: ['travel-event'],
      }
    );

    assert.ok(
      result.items.some(item =>
        item.startsWith('Appointment • ')
      )
    );
    assert.ok(
      result.items.includes('School reopens tomorrow')
    );
  });

  it('keeps the existing maximum of three Brief messages', () => {
    const result = build(
      [event('family-event', 'Family appointment')],
      {
        text: 'School reopens tomorrow',
        consumedEventIds: [],
      }
    );

    assert.ok(result.items.length <= 3);
  });
});
