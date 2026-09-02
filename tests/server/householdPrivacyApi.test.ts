import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { afterEach, describe, it } from 'node:test';
import type { HouseholdConfig } from '../../server/src/config/householdConfig.js';

const config: HouseholdConfig = {
  schemaVersion: 1,
  household: { displayName: 'API Household', members: [{ id: 'adult', displayName: 'API Adult', memberType: 'adult' }] },
  location: { name: 'API Town', latitude: 50, longitude: -1, timezone: 'Europe/London' },
  travel: { homeAddress: '99 Private API Street', leaveBufferMinutes: 12, destinations: [] },
  calendar: { endpoint: 'https://calendar.example.test/private', refreshMinutes: 20, sources: [], semanticRules: [] },
};
let server: Server | null = null;
let resetConfig: (() => void) | null = null;

async function start() {
  process.env.NEST_CLIENT_ID ??= 'test';
  process.env.NEST_CLIENT_SECRET ??= 'test';
  process.env.NEST_REFRESH_TOKEN ??= 'test';
  process.env.NEST_PROJECT_ID ??= 'test';
  process.env.NEST_DEVICE_NAME ??= 'test';
  process.env.NOTION_TOKEN ??= 'test';
  process.env.NOTION_TASKS_DATA_SOURCE_ID ??= 'test';
  const [{ createApp }, configuration] = await Promise.all([
    import('../../server/src/app.js'),
    import('../../server/src/config/householdConfig.js'),
  ]);
  configuration.setHouseholdConfigForTests(config);
  resetConfig = () => configuration.setHouseholdConfigForTests(null, 'demo');
  server = createApp({ mode: 'development', appMode: 'household' }).listen(0);
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server failed.');
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  resetConfig?.();
  resetConfig = null;
  if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = null;
});

describe('Household browser privacy APIs', { concurrency: false }, () => {
  it('returns only the no-store client allowlist', async () => {
    const base = await start();
    const response = await fetch(`${base}/api/config/client`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {
      schemaVersion: 1, appMode: 'household', household: config.household,
      location: { timezone: 'Europe/London' }, travel: { leaveBufferMinutes: 12 }, calendar: { refreshMinutes: 20 },
    });
  });

  it('exposes the address only through the narrow Settings contract', async () => {
    const base = await start();
    const general = JSON.stringify(await (await fetch(`${base}/api/config/client`)).json());
    assert.doesNotMatch(general, /Private API Street/);
    const response = await fetch(`${base}/api/config/settings/household`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { homeAddress: '99 Private API Street' });
  });

  it('does not allow the travel endpoint to accept an origin or proxy fields', async () => {
    const base = await start();
    const response = await fetch(`${base}/api/travel/route`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: 'private', destination: 'destination', url: 'https://provider.invalid' }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Invalid travel destination' });
  });

  it('keeps Household-only configuration routes absent in Demo', async () => {
    process.env.NEST_CLIENT_ID ??= 'test';
    process.env.NEST_CLIENT_SECRET ??= 'test';
    process.env.NEST_REFRESH_TOKEN ??= 'test';
    process.env.NEST_PROJECT_ID ??= 'test';
    process.env.NEST_DEVICE_NAME ??= 'test';
    process.env.NOTION_TOKEN ??= 'test';
    process.env.NOTION_TASKS_DATA_SOURCE_ID ??= 'test';
    const [{ createApp }, configuration] = await Promise.all([
      import('../../server/src/app.js'),
      import('../../server/src/config/householdConfig.js'),
    ]);
    configuration.setHouseholdConfigForTests(null, 'demo');
    server = createApp({ mode: 'development', appMode: 'demo' }).listen(0);
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server failed.');
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/config/client`)).status, 404);
  });
});
