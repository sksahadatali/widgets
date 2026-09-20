import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';
import { fileURLToPath } from 'node:url';

let vite: ViteDevServer;
let picker: typeof import('../../app/src/components/modules/Calendar/CalendarPeoplePicker');
let context: typeof import('../../app/src/household/useHouseholdProfile');
before(async () => {
  vite = await createServer({ root: fileURLToPath(new URL('../../app', import.meta.url)), mode: 'test', appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false } });
  const configuration = await vite.ssrLoadModule('/src/services/householdConfigService.ts') as typeof import('../../app/src/services/householdConfigService');
  configuration.setClientConfigForTests({ schemaVersion: 1, appMode: 'household', household: { displayName: 'Family', members: [{ id: 'adult', displayName: 'Adult', memberType: 'adult' }, { id: 'child', displayName: 'Child', memberType: 'child' }] }, location: { timezone: 'Europe/London' }, travel: { leaveBufferMinutes: 10 }, calendar: { refreshMinutes: 15 } });
  context = await vite.ssrLoadModule('/src/household/useHouseholdProfile.ts');
  picker = await vite.ssrLoadModule('/src/components/modules/Calendar/CalendarPeoplePicker.tsx');
});
after(async () => vite.close());

describe('Calendar People picker', () => {
  it('uses configured profiles and does not duplicate or alter global profile selection', () => {
    const profiles = [
      { id: 'family', kind: 'family' as const, displayName: 'Family' },
      { id: 'adult', kind: 'member' as const, displayName: 'Adult', memberType: 'adult' as const },
      { id: 'child', kind: 'member' as const, displayName: 'Child', memberType: 'child' as const },
    ];
    const html = renderToStaticMarkup(createElement(context.HouseholdProfileContext.Provider, { value: {
      profiles, selectedProfile: profiles[0], selectedProfileId: 'family', isFamilySelected: true,
      selectProfile() { throw new Error('Picker must not select the global profile.'); }, resetToFamily() {},
    } }, createElement(picker.CalendarPeoplePicker, {
      eventKey: `calendar-event-v1-${'a'.repeat(64)}`,
      assignment: { target: { kind: 'members', profileIds: ['child'] }, basis: 'source-default' },
      async onChanged() {},
    })));
    assert.match(html, /aria-label="People: Child"/);
    assert.match(html, /aria-expanded="false"/);
  });

  it('keeps save and clear on same-origin Calendar assignment APIs with Demo isolation', async () => {
    const service = await readFile(new URL('../../app/src/services/calendarService.ts', import.meta.url), 'utf8');
    const component = await readFile(new URL('../../app/src/components/modules/Calendar/CalendarPeoplePicker.tsx', import.meta.url), 'utf8');
    assert.match(service, /\/api\/calendar\/profile-assignments\//);
    assert.match(service, /getAppMode\(\) === 'demo'/);
    assert.match(component, /Use default/);
    assert.match(component, /kind: 'unassigned'/);
    assert.match(component, /type="checkbox"/);
    assert.doesNotMatch(component, /selectProfile\(/);
  });
});
