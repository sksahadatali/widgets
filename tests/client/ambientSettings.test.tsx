import assert from 'node:assert/strict';
import { before, after, describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';
import {
  AMBIENT_SETTINGS_STORAGE_KEY, DEFAULT_AMBIENT_SETTINGS,
  normalizeAmbientSettings, readAmbientSettings, writeAmbientSettings,
  isValidInactivitySeconds, isValidPageDurationSeconds,
} from '../../app/src/ambient/ambientSettings';

let vite: ViteDevServer;
let context: typeof import('../../app/src/ambient/AmbientSettingsContext');
let section: typeof import('../../app/src/ambient/AmbientSettingsSection');
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('../../app', import.meta.url)), mode: 'test',
    appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false },
  });
  context = await vite.ssrLoadModule('/src/ambient/AmbientSettingsContext.tsx');
  section = await vite.ssrLoadModule('/src/ambient/AmbientSettingsSection.tsx');
});
after(async () => { await vite.close(); });
function render(storageError = false) {
  return renderToStaticMarkup(createElement(context.AmbientSettingsContext.Provider, {
    value: { settings: DEFAULT_AMBIENT_SETTINGS, saveSettings() {}, storageError },
  }, createElement(section.AmbientSettingsSection)));
}

describe('Ambient Rotation settings', () => {
  it('uses safe defaults for absent, malformed and unsupported configuration', () => {
    for (const input of [null, undefined, {}, [], false, { version: 2, enabled: false }]) {
      assert.deepEqual(normalizeAmbientSettings(input), DEFAULT_AMBIENT_SETTINGS);
    }
    assert.deepEqual(readAmbientSettings({ getItem: () => '{broken' }), DEFAULT_AMBIENT_SETTINGS);
    assert.deepEqual(readAmbientSettings({ getItem: () => null }), DEFAULT_AMBIENT_SETTINGS);
    assert.equal(DEFAULT_AMBIENT_SETTINGS.enabled, true);
    assert.equal(DEFAULT_AMBIENT_SETTINGS.inactivitySeconds, 120);
    assert.deepEqual(DEFAULT_AMBIENT_SETTINGS.pageDurationSeconds,
      { Home: 120, Calendar: 25, Daily: 25, Rewards: 25, Lists: 25, Meals: 25 });
  });
  it('merges valid partial fields and falls back independently for invalid fields', () => {
    const actual = normalizeAmbientSettings({ version: 1, enabled: false, inactivitySeconds: 180,
      pageDurationSeconds: { Home: 60, Calendar: 9, Daily: 601, Rewards: '20', Lists: NaN, Meals: 45, Settings: 30 } });
    assert.equal(actual.enabled, false);
    assert.equal(actual.inactivitySeconds, 180);
    assert.deepEqual(actual.pageDurationSeconds, { Home: 60, Calendar: 25, Daily: 25, Rewards: 25, Lists: 25, Meals: 45 });
    assert.equal(normalizeAmbientSettings({ version: 1, enabled: 'false', inactivitySeconds: 0 }).enabled, true);
  });
  it('validates integer units and bounds', () => {
    for (const value of [60, 120, 3600]) assert.equal(isValidInactivitySeconds(value), true);
    for (const value of [59, 61, 3601, 120.5, Infinity, NaN, '120', null]) assert.equal(isValidInactivitySeconds(value), false);
    for (const value of [10, 25, 600]) assert.equal(isValidPageDurationSeconds(value), true);
    for (const value of [9, 601, 25.5, Infinity, NaN, '25', null]) assert.equal(isValidPageDurationSeconds(value), false);
  });
  it('persists and reloads validated device-local configuration', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); } };
    const settings = { ...DEFAULT_AMBIENT_SETTINGS, enabled: false, inactivitySeconds: 300 };
    assert.equal(writeAmbientSettings(storage, settings), true);
    assert.deepEqual(readAmbientSettings(storage), settings);
    assert.deepEqual([...values.keys()], [AMBIENT_SETTINGS_STORAGE_KEY]);
  });
  it('survives inaccessible storage and reports unsuccessful persistence', () => {
    assert.deepEqual(readAmbientSettings({ getItem() { throw new Error('blocked'); } }), DEFAULT_AMBIENT_SETTINGS);
    assert.equal(writeAmbientSettings({ setItem() { throw new Error('quota'); } }, DEFAULT_AMBIENT_SETTINGS), false);
    assert.match(render(true), /could not be saved on this device/);
  });
  it('renders enabled, inactivity and six duration controls using the Routines label', () => {
    const html = render();
    assert.match(html, /Enable Ambient Rotation/);
    assert.match(html, /type="checkbox" checked=""/);
    assert.match(html, /Start after inactivity \(minutes\)/);
    assert.match(html, /id="ambient-inactivity"[^>]*value="2"/);
    assert.match(html, /id="ambient-duration-Home"[^>]*value="120"/);
    assert.match(html, /Routines \(seconds\)/);
    assert.doesNotMatch(html, /Daily \(seconds\)/);
    assert.equal((html.match(/id="ambient-duration-(?:Home|Calendar|Daily|Rewards|Lists|Meals)"/g) ?? []).length, 6);
    assert.match(html, /Save settings/);
    assert.match(html, /Restore defaults/);
    assert.match(html, /Compact does not rotate/);
  });
  it('keeps one provider above the controller/routes and preserves responsive touch tokens', async () => {
    const [app, settings, css] = await Promise.all([
      readFile(new URL('../../app/src/App.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../../app/src/pages/Settings.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../../app/src/pages/Settings.css', import.meta.url), 'utf8'),
    ]);
    assert.equal((app.match(/<AmbientSettingsProvider>/g) ?? []).length, 1);
    assert.ok(app.indexOf('<AmbientSettingsProvider>') < app.indexOf('<AmbientRotationController />'));
    assert.ok(app.indexOf('</AmbientSettingsProvider>') > app.indexOf('<AppPageRoutes'));
    assert.match(settings, /<AmbientSettingsSection \/>/);
    assert.match(css, /\.ambient-settings__fields input,[\s\S]*?min-height: var\(--ey-touch-target-min\)/);
    assert.match(css, /@media \(max-width: 700px\) \{\s*\.ambient-settings__fields \{\s*grid-template-columns: 1fr/);
  });
});
