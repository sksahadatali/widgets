import './helpers/providerEnvironment.js';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { gzipSync } from 'node:zlib';
import axios from 'axios';
import { createApp } from '../../server/src/app.js';
import { testRuntime } from './helpers/householdAccess.js';

async function listen(t: TestContext, server: Server) {
  server.listen(0, '127.0.0.1');
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  }));
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

test('petrol OAuth never follows redirects and keeps provider errors private', async t => {
  const secret = 'synthetic-petrol-secret';
  const token = 'synthetic-petrol-token';
  const infoLog = t.mock.method(console, 'log', () => {});
  const errorLog = t.mock.method(console, 'error', () => {});
  for (const [key, value] of Object.entries({
    FUEL_FINDER_CLIENT_ID: 'synthetic-petrol-id',
    FUEL_FINDER_CLIENT_SECRET: secret,
    FUEL_FINDER_SCOPE: 'fuelfinder.read',
    FUEL_FINDER_STATION_BRAND: 'Fixture',
    FUEL_FINDER_POSTCODE_PREFIX: 'ZZ1',
  })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }

  let redirected = 0;
  const redirectAuth: (string | undefined)[] = [];
  const prices = [{ node_id: 7, fuel_prices: [{ fuel_type: 'E10', price: 123.9, price_last_updated: '2026-11-06' }] }];
  const sink = await listen(t, createServer((request, response) => {
    if (request.url === '/prices') {
      redirectAuth.push(request.headers.authorization);
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(prices));
      return;
    }
    redirected++;
    request.resume();
    response.end('unexpected redirect destination');
  }));
  const tokenPath = '/api/v1/oauth/generate_access_token';
  let tokenStatus = 401;
  let sameOrigin = false;
  const attempts: { method?: string; body: string }[] = [];
  const dataHeaders: (string | undefined)[] = [];
  const stationBatches: (string | null)[] = [];
  const provider = await listen(t, createServer(async (request, response) => {
    if (request.url === '/sink') {
      redirected++;
      request.resume();
      response.end('unexpected redirect destination');
      return;
    }

    response.setHeader('Content-Type', 'application/json');
    if (request.url === tokenPath) {
      let body = '';
      for await (const chunk of request) body += chunk;
      attempts.push({ method: request.method, body });
      response.statusCode = tokenStatus;
      if (tokenStatus >= 300 && tokenStatus < 400) {
        response.setHeader('Location', sameOrigin ? '/sink' : sink + '/sink');
      }
      response.end(JSON.stringify(tokenStatus === 200
        ? { data: { access_token: token, expires_in: 3600 } }
        : { error: `synthetic upstream details: ${secret} ${token}` }));
      return;
    }

    dataHeaders.push(request.headers.authorization);
    const url = new URL(request.url ?? '/', 'http://fixture');
    if (url.pathname === '/api/v1/pfs') {
      const batch = url.searchParams.get('batch-number');
      stationBatches.push(batch);
      if (stationBatches.length === 1 || batch === '2') {
        response.statusCode = batch === '2' ? 404 : 403;
        response.end('{}');
        return;
      }
      const station = { node_id: 7, trading_name: 'Fixture Station', brand_name: 'Fixture',
        location: { postcode: 'ZZ1 1ZZ' } };
      response.end(JSON.stringify(Array.from({ length: 500 }, () => station)));
      return;
    }
    response.writeHead(307, { Location: sink + '/prices' });
    response.end();
  }));

  // Rewrite the fixed provider URL to loopback without changing redirect options.
  const interceptor = axios.interceptors.request.use(config => {
    const url = new URL(config.url ?? '');
    assert.equal(url.origin, 'https://www.fuel-finder.service.gov.uk');
    config.url = provider + url.pathname;
    config.proxy = false;
    config.timeout = 3000;
    return config;
  });
  t.after(() => axios.interceptors.request.eject(interceptor));

  const { context } = await testRuntime();
  const app = createApp({ mode: 'development', appMode: 'household',
    accessBoundary: { mode: 'household', context } });
  const endpoint = await listen(t, createServer(app)) + '/api/petrol';
  const failures = [{ status: 401, sameOrigin: false },
    ...[301, 302, 303, 307, 308].flatMap(status =>
      [false, true].map(sameOrigin => ({ status, sameOrigin })))];

  for (const scenario of failures) {
    ({ status: tokenStatus, sameOrigin } = scenario);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Petrol unavailable' });
    assert.equal(redirected, 0, `followed ${tokenStatus} (same origin: ${sameOrigin})`);
  }
  assert.equal(dataHeaders.length, 0);
  assert.equal(errorLog.mock.callCount(), failures.length);
  for (const call of errorLog.mock.calls) {
    assert.deepEqual(call.arguments, ['Petrol provider request failed.']);
  }

  tokenStatus = 200;
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    station: 'Fixture Station', petrolPrice: 123.9, updatedAt: '2026-11-06',
  });
  assert.deepEqual(stationBatches, ['1', '1', '2']);
  assert.deepEqual(dataHeaders, Array(4).fill(`Bearer ${token}`));
  assert.deepEqual(redirectAuth, [undefined]);
  assert.equal(redirected, 0);
  assert.equal(attempts.length, failures.length + 1);
  for (const attempt of attempts) {
    assert.equal(attempt.method, 'POST');
    assert.deepEqual(Object.fromEntries(new URLSearchParams(attempt.body)), {
      grant_type: 'client_credentials', client_id: 'synthetic-petrol-id',
      client_secret: secret, scope: 'fuelfinder.read',
    });
  }
  for (const call of infoLog.mock.calls) {
    const line = JSON.stringify(call.arguments);
    for (const marker of [secret, token, 'synthetic-petrol-id', 'grant_type=']) {
      assert.ok(!line.includes(marker), 'petrol log disclosed request data');
    }
  }
});

test('compressed JSON preserves identity checks and malformed requests leave the app responsive', async t => {
  const { root, context } = await testRuntime();
  const store = join(root, 'data', 'lists.local.json');
  const before = await readFile(store);
  const app = createApp({ mode: 'development', appMode: 'household',
    accessBoundary: { mode: 'household', context } });
  const base = await listen(t, createServer(app));
  const post = (body: Buffer) => fetch(base + '/api/lists', {
    method: 'POST', body, signal: AbortSignal.timeout(5000),
    headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
  });
  const candidate = { id: '00000000-0000-4000-8000-000000000002', name: 'Compressed fixture' };

  const spoof = await post(gzipSync(JSON.stringify({ ...candidate, householdId: 'forged' })));
  assert.equal(spoof.status, 403);
  await spoof.text();

  for (const compressed of [
    Buffer.concat([gzipSync(JSON.stringify(candidate)), Buffer.from('trailing garbage')]),
    gzipSync('{'),
    gzipSync(JSON.stringify({ ...candidate, name: 'x'.repeat(110_000) })),
  ]) {
    const rejected = await post(compressed);
    assert.ok(rejected.status >= 400);
    await rejected.text();
  }
  assert.deepEqual(await readFile(store), before);
  const health = await fetch(base + '/health', { signal: AbortSignal.timeout(5000) });
  assert.equal(health.status, 200);
  await health.text();

  const accepted = await post(gzipSync(JSON.stringify(candidate)));
  assert.equal(accepted.status, 201);
  assert.match(await accepted.text(), /Compressed fixture/);
});

test('forwarded IPv4-mapped addresses do not grant household access', async t => {
  await testRuntime();
  const app = createApp({ mode: 'development', appMode: 'household',
    accessBoundary: { mode: 'household' } });
  const base = await listen(t, createServer(app));
  const response = await fetch(base + '/api/lists', {
    headers: { 'X-Forwarded-For': '::ffff:127.0.0.1', 'X-Forwarded-Host': 'localhost' },
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 503);
  await response.text();
});
