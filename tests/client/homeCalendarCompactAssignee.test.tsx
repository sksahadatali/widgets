import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';

import type { CalendarEvent } from '../../app/src/calendar/calendarModel.ts';

let vite: ViteDevServer;
let calendar: typeof import('../../app/src/components/modules/Calendar/Calendar');
let context: typeof import('../../app/src/household/useHouseholdProfile');

const profiles = [
  { id: 'family', kind: 'family' as const, displayName: 'Family' },
  { id: 'rehan', kind: 'member' as const, displayName: 'Rehan', memberType: 'child' as const },
];

function event(target: CalendarEvent['profileAssignment']['target'], location = ''): CalendarEvent {
  return {
    id: 'arabic-lesson',
    eventKey: `calendar-event-v1-${'a'.repeat(64)}`,
    title: 'Rehan - Arabic lesson',
    start: '2026-09-21T17:30:00.000Z',
    end: '2026-09-21T18:30:00.000Z',
    startLocalDate: '2026-09-21',
    endLocalDateExclusive: '2026-09-22',
    allDay: false,
    location,
    description: '',
    calendarUrl: '',
    source: { id: 'family', label: 'Family', kind: 'family' },
    profileAssignment: { target, basis: 'explicit' },
  };
}

function renderEvent(
  target: CalendarEvent['profileAssignment']['target'],
  location = '',
  showDate = false
): string {
  return renderToStaticMarkup(
    createElement(context.HouseholdProfileContext.Provider, {
      value: {
        profiles,
        selectedProfile: profiles[0],
        selectedProfileId: 'family',
        isFamilySelected: true,
        selectProfile() {},
        resetToFamily() {},
      },
    }, createElement(calendar.CalendarEventRow, {
      event: event(target, location),
      timeZone: 'Europe/London',
      showDate,
      onAssignmentChanged: async () => undefined,
    }))
  );
}

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('../../app', import.meta.url)),
    mode: 'test',
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false },
  });
  const configuration = await vite.ssrLoadModule('/src/services/householdConfigService.ts') as typeof import('../../app/src/services/householdConfigService');
  configuration.setClientConfigForTests({
    schemaVersion: 1,
    appMode: 'household',
    household: { displayName: 'Family', members: [{ id: 'rehan', displayName: 'Rehan', memberType: 'child' }] },
    location: { timezone: 'Europe/London' },
    travel: { leaveBufferMinutes: 10 },
    calendar: { refreshMinutes: 15 },
  });
  context = await vite.ssrLoadModule('/src/household/useHouseholdProfile.ts');
  calendar = await vite.ssrLoadModule('/src/components/modules/Calendar/Calendar.tsx');
});

after(async () => vite.close());

describe('Home Calendar compact assignee presentation', () => {
  it('renders an assigned member inline without the legacy assignee pill', () => {
    const html = renderEvent({ kind: 'members', profileIds: ['rehan'] });

    assert.match(html, /calendar-card__event-heading[\s\S]*calendar-people--inline/);
    assert.match(html, /calendar-people__inline-trigger[^>]*>[\s\S]*<span>Rehan<\/span>/);
    assert.doesNotMatch(html, /class="calendar-people__trigger"/);
  });

  it('renders a subdued dash for an unassigned event', () => {
    const html = renderEvent({ kind: 'unassigned' });

    assert.match(html, /aria-label="People: Unassigned"/);
    assert.match(html, /<span>—<\/span>/);
    assert.doesNotMatch(html, />Unassigned<\/span>/);
    assert.doesNotMatch(html, /title="Unassigned"/);
  });

  it('keeps location on the line after the compact heading', () => {
    const html = renderEvent(
      { kind: 'unassigned' },
      'Gilbert Inglefield School House, Vandyke Road'
    );

    assert.match(html, /calendar-card__event-heading[\s\S]*calendar-card__location/);
    assert.match(html, /Gilbert Inglefield School House, Vandyke Road/);
  });

  it('preserves Home date-group order and event iteration', async () => {
    const source = await readFile(
      new URL('../../app/src/components/modules/Calendar/Calendar.tsx', import.meta.url),
      'utf8'
    );
    const today = source.indexOf('title="Today"');
    const tomorrow = source.indexOf('title="Tomorrow"');
    const comingUp = source.indexOf('title="Coming Up"');

    assert.ok(today >= 0 && today < tomorrow && tomorrow < comingUp);
    assert.match(source, /events\.map\(event =>/);
  });

  it('constrains long inline text across Compact and Elo Touch profiles', async () => {
    const styles = await readFile(
      new URL('../../app/src/components/modules/Calendar/Calendar.css', import.meta.url),
      'utf8'
    );

    assert.match(styles, /\.calendar-people__inline-trigger span \{[^}]*text-overflow: ellipsis;/);
    assert.match(styles, /data-display-profile='compact'[\s\S]*\.calendar-people__inline-trigger/);
    assert.match(styles, /data-display-profile='elo-touch'[\s\S]*\.calendar-people__inline-trigger/);
  });

  it('uses narrow baseline-aligned time, title and assignee columns', async () => {
    const styles = await readFile(
      new URL('../../app/src/components/modules/Calendar/Calendar.css', import.meta.url),
      'utf8'
    );

    assert.match(styles, /\.calendar-card__event\s*\{[^}]*grid-template-columns:\s*52px minmax\(0, 1fr\);[^}]*align-items: baseline;[^}]*column-gap: 8px;/s);
    assert.match(styles, /\.calendar-card__event-heading\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(24px, 120px\);[^}]*align-items: baseline;/s);
    assert.match(styles, /\.calendar-people__inline-trigger\s*\{[^}]*align-items: baseline;/s);
    assert.match(styles, /data-display-profile='compact'[\s\S]*grid-template-columns:\s*46px minmax\(0, 1fr\);/);
  });

  it('keeps the location close and leaves inline assignee glyphs unclipped', async () => {
    const styles = await readFile(
      new URL('../../app/src/components/modules/Calendar/Calendar.css', import.meta.url),
      'utf8'
    );

    assert.match(styles, /\.calendar-people__inline-trigger\s*\{[^}]*min-height: 0;[^}]*overflow: visible;[^}]*padding: 0 2px;/s);
    assert.match(styles, /\.calendar-people__inline-trigger span\s*\{[^}]*max-width: 100%;[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;/s);
    assert.match(styles, /data-display-profile='compact'[\s\S]*\.calendar-card__event-content\s*\{[^}]*gap: 4px;/s);
    assert.match(styles, /data-display-profile='elo-touch'[\s\S]*\.calendar-people__inline-trigger::before\s*\{[^}]*height: 44px;/s);
  });

  it('lets Home event rows follow their natural content height', async () => {
    const styles = await readFile(
      new URL('../../app/src/components/modules/Calendar/Calendar.css', import.meta.url),
      'utf8'
    );

    assert.match(styles, /\.calendar-card__event\s*\{[^}]*min-height: 0;[^}]*padding: 6px 4px;/s);
    assert.match(styles, /data-display-profile='compact'[\s\S]*\.calendar-card__event\s*\{[^}]*min-height: 0;[^}]*padding: 3px 2px;/s);
    assert.match(styles, /\.calendar-people__inline-trigger::before\s*\{[^}]*height: 30px;/s);
    assert.match(styles, /data-display-profile='elo-touch'[\s\S]*\.calendar-people__inline-trigger::before\s*\{[^}]*height: 44px;/s);
  });

  it('gives Coming Up rows a readable date column and modest separation', async () => {
    const html = renderEvent(
      { kind: 'members', profileIds: ['rehan'] },
      '',
      true
    );
    const styles = await readFile(
      new URL('../../app/src/components/modules/Calendar/Calendar.css', import.meta.url),
      'utf8'
    );

    assert.match(html, /calendar-card__event--dated/);
    assert.match(html, /calendar-card__date/);
    assert.match(
      styles,
      /\.calendar-card__event--dated\s*\{[^}]*grid-template-columns:\s*72px minmax\(0, 1fr\);[^}]*align-items:\s*start;[^}]*column-gap:\s*10px;[^}]*padding-block:\s*8px;/s
    );
    assert.match(
      styles,
      /data-display-profile='compact'[\s\S]*\.calendar-card__event--dated\s*\{[^}]*grid-template-columns:\s*62px minmax\(0, 1fr\);[^}]*padding-block:\s*5px;/s
    );
  });
});
