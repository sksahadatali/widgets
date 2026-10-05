import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
let router: typeof import('react-router-dom');
import { createServer, type ViteDevServer } from 'vite';
import { DEFAULT_AMBIENT_SETTINGS, AMBIENT_SETTINGS_STORAGE_KEY, type AmbientSettings } from '../../app/src/ambient/ambientSettings';

// A minimal host for a mounted, null-rendering controller: React owns the real
// context/effect/router lifecycle; only the browser clock and DOM queries are fake.
let now = 0;
let nextId = 0;
const timers = new Map<number, { at: number; callback: () => void }>();
const listeners = new Map<string, Set<() => void>>();
const values = new Map<string, string>();
let blocked = false;
const documentHost: any = {
  nodeType: 9, activeElement: null,
  addEventListener() {}, removeEventListener() {},
  querySelector: () => blocked ? {} : null,
};
const windowHost: any = {
  document: documentHost, HTMLIFrameElement: class {},
  localStorage: { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } },
  setTimeout: (callback: () => void, delay: number) => {
    const id = ++nextId; timers.set(id, { at: now + delay, callback }); return id;
  },
  clearTimeout: (id: number) => timers.delete(id),
  addEventListener: (event: string, callback: () => void) => {
    const callbacks = listeners.get(event) ?? new Set(); callbacks.add(callback); listeners.set(event, callbacks);
  },
  removeEventListener: (event: string, callback: () => void) => listeners.get(event)?.delete(callback),
};
documentHost.defaultView = windowHost;
function container() {
  return { nodeType: 1, tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: documentHost, addEventListener() {}, removeEventListener() {}, textContent: '' } as unknown as HTMLElement;
}
documentHost.documentElement = container();
let vite: ViteDevServer;
let ambient: typeof import('../../app/src/ambient/useAmbientRotation');
let settingsContext: typeof import('../../app/src/ambient/AmbientSettingsContext');
let display: typeof import('../../app/src/display/useDisplayProfile');
let path = '';
let save: (settings: AmbientSettings) => void;
const observedPaths: string[] = [];
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalFetch = globalThis.fetch;

before(async () => {
  Object.defineProperty(globalThis, 'window', { value: windowHost, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: documentHost, configurable: true });
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = async () => new Response(JSON.stringify({
    calendarUrl: '', generatedAt: new Date().toISOString(), timeZone: 'Europe/London', events: [],
  }), { status: 200 });
  vite = await createServer({ root: fileURLToPath(new URL('../../app', import.meta.url)),
    mode: 'test', appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false } });
  const configuration = await vite.ssrLoadModule('/src/services/householdConfigService.ts');
  configuration.setClientConfigForTests({
    schemaVersion: 1, appMode: 'household', household: { displayName: 'Test', members: [] },
    location: { timezone: 'Europe/London' }, travel: { leaveBufferMinutes: 10 }, calendar: { refreshMinutes: 15 },
  });
  router = await import(new URL('../../app/node_modules/react-router-dom/dist/index.mjs', import.meta.url).href);
  ambient = await vite.ssrLoadModule('/src/ambient/useAmbientRotation.ts');
  settingsContext = await vite.ssrLoadModule('/src/ambient/AmbientSettingsContext.tsx');
  display = await vite.ssrLoadModule('/src/display/useDisplayProfile.ts');
});
after(async () => {
  await vite.close();
  for (const [key, descriptor] of [['window', originalWindow], ['document', originalDocument]] as const) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  globalThis.fetch = originalFetch;
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});

function Controller() {
  ambient.useAmbientRotation();
  const location = router.useLocation();
  save = settingsContext.useAmbientSettings().saveSettings;
  useEffect(() => { path = location.pathname; observedPaths.push(path); }, [location.pathname]);
  return null;
}
async function mount(profile: 'desktop' | 'elo-touch' | 'compact' = 'desktop', preserveStorage = false) {
  now = 0; timers.clear(); listeners.clear();
  if (!preserveStorage) values.clear();
  observedPaths.length = 0; blocked = false; documentHost.activeElement = null;
  const root = createRoot(container());
  await act(async () => { root.render(createElement(router.MemoryRouter, { initialEntries: ['/lists'] },
    createElement(display.DisplayProfileContext.Provider, {
      value: { preference: profile, effectiveProfile: profile, viewport: { width: 1920, height: 1080 }, setPreference() {} },
    }, createElement(settingsContext.AmbientSettingsProvider, { children: createElement(Controller) })))); });
  return root;
}
async function advance(ms: number) {
  const target = now + ms;
  while (true) {
    const next = [...timers.entries()].filter(([, timer]) => timer.at <= target)
      .sort((a, b) => a[1].at - b[1].at)[0];
    if (!next) break;
    now = next[1].at; timers.delete(next[0]);
    await act(async () => { next[1].callback(); });
  }
  now = target;
}
async function activity() {
  await act(async () => { for (const callback of listeners.get('pointerdown') ?? []) callback(); });
}

describe('mounted Ambient settings/controller lifecycle', () => {
  it('continues through real router updates, stops on activity, and cleans up', async () => {
    const root = await mount();
    try {
      await advance(119_999); assert.equal(path, '/lists');
      await advance(1); assert.equal(path, '/');
      await advance(120_000); assert.equal(path, '/calendar');
      for (const expected of ['/daily', '/rewards', '/lists', '/meals', '/']) {
        await advance(25_000); assert.equal(path, expected);
      }
      assert.deepEqual(observedPaths, ['/lists', '/', '/calendar', '/daily', '/rewards', '/lists', '/meals', '/']);
      await activity();
      await advance(119_999); assert.equal(path, '/');
      await advance(1); assert.equal(path, '/');
      await advance(119_999); assert.equal(path, '/');
      await advance(1); assert.equal(path, '/calendar');
    } finally { await act(async () => root.unmount()); }
    assert.equal(timers.size, 0);
    assert.ok([...listeners.values()].every(callbacks => callbacks.size === 0));
  });
  it('applies and persists saves, cancels disabled rotation, and ignores no-op saves', async () => {
    const root = await mount('elo-touch');
    try {
      await advance(120_000); await advance(120_000); assert.equal(path, '/calendar');
      await act(async () => save({ ...DEFAULT_AMBIENT_SETTINGS, enabled: false }));
      assert.equal(timers.size, 0);
      await advance(500_000); assert.equal(path, '/calendar');
      assert.equal(JSON.parse(values.get(AMBIENT_SETTINGS_STORAGE_KEY)!).enabled, false);
      const custom = { ...DEFAULT_AMBIENT_SETTINGS, inactivitySeconds: 60,
        pageDurationSeconds: { ...DEFAULT_AMBIENT_SETTINGS.pageDurationSeconds, Home: 10 } };
      await act(async () => save(custom));
      await advance(30_000);
      const timerIds = [...timers.keys()];
      await act(async () => save({ ...custom, pageDurationSeconds: { ...custom.pageDurationSeconds } }));
      assert.deepEqual([...timers.keys()], timerIds);
      await advance(29_999); assert.equal(path, '/calendar');
      await advance(1); assert.equal(path, '/');
      await advance(10_000); assert.equal(path, '/calendar');
    } finally { await act(async () => root.unmount()); }
  });
  it('reloads saved disabled settings on a new provider mount', async () => {
    const root = await mount();
    await act(async () => save({ ...DEFAULT_AMBIENT_SETTINGS, enabled: false }));
    await act(async () => root.unmount());
    const reloaded = await mount('elo-touch', true);
    try {
      await advance(1_000_000); assert.equal(path, '/lists');
      assert.equal(timers.size, 0);
    } finally { await act(async () => reloaded.unmount()); }
  });
  it('uses saved settings for the session even when persistence fails', async () => {
    const root = await mount();
    const setItem = windowHost.localStorage.setItem;
    try {
      windowHost.localStorage.setItem = () => { throw new Error('blocked'); };
      await act(async () => save({ ...DEFAULT_AMBIENT_SETTINGS, enabled: false }));
      assert.equal(timers.size, 0);
      await advance(1_000_000); assert.equal(path, '/lists');
    } finally {
      windowHost.localStorage.setItem = setItem;
      await act(async () => root.unmount());
    }
  });
  it('blocks active editors and keeps Compact ineligible', async () => {
    const root = await mount();
    try {
      blocked = true;
      await advance(120_000); assert.equal(path, '/lists');
      blocked = false;
      await advance(120_000); assert.equal(path, '/');
    } finally { await act(async () => root.unmount()); }
    const compactRoot = await mount('compact');
    try {
      await advance(1_000_000); assert.equal(path, '/lists');
      assert.equal(timers.size, 0);
      assert.ok([...listeners.values()].every(callbacks => callbacks.size === 0));
    } finally { await act(async () => compactRoot.unmount()); }
  });
});
