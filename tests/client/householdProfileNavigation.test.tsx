import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { before, after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';
import type { HouseholdConfig } from '../../app/src/services/householdConfigService';
import type { HouseholdProfile } from '../../app/src/household/householdProfiles';

let vite: ViteDevServer;
let header: typeof import('../../app/src/components/layout/Header/Header');
let switcher: typeof import('../../app/src/components/household/ProfileSwitcher/ProfileSwitcher');
let context: typeof import('../../app/src/household/useHouseholdProfile');
let model: typeof import('../../app/src/household/householdProfiles');
let provider: typeof import('../../app/src/household/HouseholdProfileContext');
let configuration: typeof import('../../app/src/services/householdConfigService');

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('../../app', import.meta.url)),
    mode: 'test', appType: 'custom', logLevel: 'error',
    server: { middlewareMode: true },
  });
  header = await vite.ssrLoadModule('/src/components/layout/Header/Header.tsx');
  switcher = await vite.ssrLoadModule('/src/components/household/ProfileSwitcher/ProfileSwitcher.tsx');
  context = await vite.ssrLoadModule('/src/household/useHouseholdProfile.ts');
  model = await vite.ssrLoadModule('/src/household/householdProfiles.ts');
  provider = await vite.ssrLoadModule('/src/household/HouseholdProfileContext.tsx');
  configuration = await vite.ssrLoadModule('/src/services/householdConfigService.ts');
});
after(async () => { await vite.close(); });

function config(mode: 'demo' | 'household'): HouseholdConfig {
  return {
    schemaVersion: 1,
    household: { displayName: 'Synthetic Household', members: [
      { id: 'adult-b', displayName: 'Taylor', memberType: 'adult' },
      { id: 'child-a', displayName: 'Robin', memberType: 'child' },
    ] }, appMode: mode,
    location: { timezone: 'Europe/London' },
    travel: { leaveBufferMinutes: 10 }, calendar: { refreshMinutes: 15 },
  };
}

function profiles(mode: 'demo' | 'household'): HouseholdProfile[] {
  return model.buildHouseholdProfiles(config(mode));
}

function renderHeader(items: HouseholdProfile[], selectedId = 'family'): string {
  return renderToStaticMarkup(createElement(context.HouseholdProfileContext.Provider, {
    value: {
      profiles: items, selectedProfile: items.find(item => item.id === selectedId)!,
      selectedProfileId: selectedId, isFamilySelected: selectedId === 'family',
      selectProfile() {}, resetToFamily() {},
    },
  }, createElement(header.default, { isMenuOpen: false, onMenuToggle() {} })));
}

describe('shared household profile navigation', () => {
  for (const mode of ['demo', 'household'] as const) {
    it(`uses the existing provider and client configuration in ${mode}`, () => {
      configuration.setClientConfigForTests(config(mode));
      const html = renderToStaticMarkup(createElement(provider.HouseholdProfileProvider, {
        children: createElement(header.default, { isMenuOpen: false, onMenuToggle() {} }),
      }));
      assert.match(html, /aria-label="Taylor"/);
      assert.match(html, /aria-label="Robin"/);
      assert.match(html, /aria-label="Family" aria-pressed="true"/);
    });
    it(`renders Family then configured members in ${mode} without a redundant selector`, () => {
      const html = renderHeader(profiles(mode));
      assert.match(html, /aria-label="Household profiles"/);
      assert.ok(html.indexOf('aria-label="Family"') < html.indexOf('aria-label="Taylor"'));
      assert.ok(html.indexOf('aria-label="Taylor"') < html.indexOf('aria-label="Robin"'));
      assert.match(html, /morning Family|afternoon Family|evening Family/);
      assert.doesNotMatch(html, /Switch household profile|aria-haspopup|profile-switcher__panel/);
      assert.match(html, /Search eY OS/);
      assert.match(html, /header__date-time/);
      assert.match(html, /aria-label="Notifications"/);
    });
  }

  it('exposes the selected member programmatically and preserves profile-aware greeting', () => {
    const html = renderHeader(profiles('household'), 'child-a');
    assert.match(html, /aria-label="Robin" aria-pressed="true"/);
    assert.match(html, /morning Robin|afternoon Robin|evening Robin/);
    assert.match(html, /profile-strip__option--selected/);
    assert.match(html, /aria-label="Family" aria-pressed="false"/);
  });

  it('routes member and Family button activation to the existing selection callback', () => {
    const selected: string[] = [];
    const element = switcher.ProfileOptions({
      profiles: profiles('household'), selectedProfileId: 'family',
      selectProfile: id => selected.push(id),
    });
    const buttons = (element as ReactElement<{ children: ReactElement<{ onClick: () => void; type: string }>[] }>).props.children;
    assert.ok(buttons.every(button => button.props.type === 'button'));
    buttons[2].props.onClick();
    buttons[0].props.onClick();
    assert.deepEqual(selected, ['child-a', 'family']);
  });

  it('keeps the single session provider outside page routing and mounts one global Header', async () => {
    const app = await readFile(new URL('../../app/src/App.tsx', import.meta.url), 'utf8');
    const provider = await readFile(new URL('../../app/src/household/HouseholdProfileContext.tsx', import.meta.url), 'utf8');
    assert.equal((app.match(/<Header\s/g) ?? []).length, 1);
    assert.ok(app.indexOf('<HouseholdProfileProvider>') < app.indexOf('<AppPageRoutes'));
    assert.ok(app.indexOf('</HouseholdProfileProvider>') > app.indexOf('<AppPageRoutes'));
    assert.doesNotMatch(provider, /localStorage|sessionStorage/);
    // Route changes cannot remount/reset the provider: it is not keyed to a route.
    assert.doesNotMatch(app, /<HouseholdProfileProvider\s+key=/);
  });

  it('allows intrinsic single-line wide greetings while retaining constrained layouts', async () => {
    const layout = await readFile(new URL('../../app/src/components/layout/Header/Header.css', import.meta.url), 'utf8');
    const wide = layout.slice(layout.indexOf('@media (min-width: 1101px)'), layout.indexOf('@media (max-width: 1100px)'));
    assert.match(wide, /data-display-profile='desktop'/);
    assert.match(wide, /data-display-profile='elo-touch'/);
    assert.doesNotMatch(wide, /data-display-profile='compact'/);
    assert.match(wide, /width: max-content;\s*max-width: 35vw;/);
    assert.match(wide, /white-space: nowrap;\s*overflow-wrap: normal;\s*overflow: hidden;\s*text-overflow: ellipsis;/);
    assert.match(layout, /@media \(max-width: 1100px\)/);
  });

  it('contains overflow and provides Compact/Desktop/Elo sizing and visible keyboard focus', async () => {
    const css = await readFile(new URL('../../app/src/components/household/ProfileSwitcher/ProfileSwitcher.css', import.meta.url), 'utf8');
    const layout = await readFile(new URL('../../app/src/components/layout/Header/Header.css', import.meta.url), 'utf8');
    assert.match(css, /min-width: 0;[\s\S]*max-width: 100%;[\s\S]*overflow-x: auto;/);
    assert.match(layout, /grid-template-columns: auto minmax\(0, 1fr\) auto;/);
    assert.match(css, /width: 40px;[\s\S]*height: 40px;/);
    assert.match(css, /data-display-profile='elo-touch'[\s\S]*width: 44px;/);
    assert.match(css, /data-display-profile='compact'[\s\S]*min-height: 48px;/);
    assert.match(css, /:focus-visible/);
    assert.match(css, /@media \(max-width: 700px\)/);
  });
});
