import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { setHouseholdConfigForTests, type HouseholdConfig } from '../../server/src/config/householdConfig.js';
import { getSafeCalendarData } from '../../server/src/services/calendarProvider.js';
import { getPrayerTimes } from '../../server/src/services/prayerProvider.js';
import { getRoute } from '../../server/src/services/travelProvider.js';
import { getWeather } from '../../server/src/services/weatherProvider.js';

const config: HouseholdConfig = {
  schemaVersion: 1,
  household: { displayName: 'Provider Household', members: [{ id: 'adult', displayName: 'Adult', memberType: 'adult' }] },
  location: { name: 'Provider Town', latitude: 51.234567, longitude: -0.765432, timezone: 'Europe/London' },
  travel: { homeAddress: 'Private Origin Address', leaveBufferMinutes: 10, destinations: [] },
  calendar: {
    endpoint: 'https://calendar.example.test/private-provider', refreshMinutes: 15,
    sources: [{ sourceId: 'school', label: 'School', kind: 'school', calendarId: 'raw-private-calendar-id' }],
    semanticRules: [{ sourceId: 'school', kind: 'school.holiday', titleEquals: 'Private matching title', label: 'Half-term' }],
  },
};

afterEach(() => { setHouseholdConfigForTests(null, 'demo'); delete process.env.GOOGLE_MAPS_API_KEY; });

describe('purpose-specific provider privacy', () => {
  it('normalizes Weather without returning coordinates', async () => {
    setHouseholdConfigForTests(config);
    let requested = '';
    const result = await getWeather(async input => {
      requested = String(input);
      return new Response(JSON.stringify({ current: { temperature_2m: 16.2, apparent_temperature: 15.6, relative_humidity_2m: 70, weather_code: 2 }, daily: { time: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'], weather_code: [2, 0, 3, 61], temperature_2m_max: [18, 19, 17, 16], temperature_2m_min: [10, 11, 9, 8] } }));
    });
    assert.match(requested, /51\.234567/);
    assert.equal(result.location, 'Provider Town');
    assert.doesNotMatch(JSON.stringify(result), /51\.234567|-0\.765432/);
  });

  it('uses the private Prayer address without returning it', async () => {
    setHouseholdConfigForTests(config);
    let requested = '';
    const result = await getPrayerTimes(async input => {
      requested = String(input);
      return new Response(JSON.stringify({ data: { timings: { Fajr: '05:00', Sunrise: '06:30', Dhuhr: '13:00', Asr: '17:00', Maghrib: '20:00', Isha: '21:30' }, date: { hijri: { day: '18', month: { en: 'Rabi al-Awwal' }, year: '1448' } } } }));
    });
    assert.match(requested, /Private\+Origin\+Address/);
    assert.doesNotMatch(JSON.stringify(result), /Private Origin Address/);
  });

  it('returns safe Calendar identities and server-derived semantics', async () => {
    setHouseholdConfigForTests(config);
    const result = await getSafeCalendarData(async input => {
      assert.equal(String(input), config.calendar.endpoint);
      return new Response(JSON.stringify({ success: true, timeZone: 'Europe/London', events: [{ id: 'provider-event-id', title: 'Private matching title', start: '2026-10-26', end: '2026-10-31', allDay: true, description: 'private provider description', calendarId: 'raw-private-calendar-id', calendarName: 'Raw Private Name' }] }));
    });
    assert.equal(result.events[0].semantic?.kind, 'school.holiday');
    assert.equal(result.events[0].endLocalDateExclusive, '2026-10-31');
    const serialized = JSON.stringify(result);
    for (const forbidden of ['raw-private-calendar-id', 'Raw Private Name', 'private provider description', 'calendar.example.test']) assert.doesNotMatch(serialized, new RegExp(forbidden.replaceAll('.', '\\.')));
  });

  it('uses the configured Travel origin and returns only route summary', async () => {
    setHouseholdConfigForTests(config);
    process.env.GOOGLE_MAPS_API_KEY = 'synthetic-server-key';
    const addresses: string[] = [];
    const result = await getRoute('Requested Destination', async (input, init) => {
      const url = String(input);
      if (url.includes('geocode')) {
        addresses.push(new URL(url).searchParams.get('address') ?? '');
        return new Response(JSON.stringify({ status: 'OK', results: [{ geometry: { location: { lat: 51, lng: -1 } } }] }));
      }
      assert.doesNotMatch(String(init?.body), /Private Origin Address|Requested Destination/);
      return new Response(JSON.stringify({ routes: [{ duration: '1200s', distanceMeters: 5000 }] }));
    });
    assert.deepEqual(addresses, ['Private Origin Address', 'Requested Destination']);
    assert.deepEqual(result, { travelMinutes: 20, distanceKm: 5 });
  });
});
