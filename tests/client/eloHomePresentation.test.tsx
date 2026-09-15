import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const appRoot = new URL('../../app/src/', import.meta.url);

async function read(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, appRoot), 'utf8');
}

describe('Elo Home presentation', () => {
  it('keeps the existing Home grid while applying wide-screen Elo density only', async () => {
    const css = await read('pages/Home.css');

    assert.match(css, /grid-template-columns:\s*repeat\(12,/);
    assert.match(css, /\.home__brief\s*\{[^}]*grid-column:\s*span 8;/s);
    assert.match(css, /\.home__focus\s*\{[^}]*grid-column:\s*span 4;/s);
    assert.match(css, /\.home__status\s*\{[^}]*grid-column:\s*1 \/ -1;/s);
    assert.match(
      css,
      /\.home__due-soon,[\s\S]*?\.home__calendar\s*\{[^}]*grid-column:\s*span 4;/,
    );
    assert.match(
      css,
      /@media \(min-width: 1201px\)[\s\S]*?data-display-profile='elo-touch'[\s\S]*?\.home\s*\{[^}]*--ey-list-max-height:\s*260px;[^}]*gap:\s*16px;/,
    );
  });

  it('removes Elo-only upper-card minimum heights without using Compact typography', async () => {
    const [brief, focus] = await Promise.all([
      read('components/modules/TodaysBrief/TodaysBrief.css'),
      read('components/modules/TodaysFocus/TodaysFocus.css'),
    ]);

    for (const css of [brief, focus]) {
      assert.match(
        css,
        /@media \(min-width: 1201px\)[\s\S]*?data-display-profile='elo-touch'[\s\S]*?min-height:\s*0;/,
      );
    }
    assert.doesNotMatch(
      `${brief}\n${focus}`.split("data-display-profile='compact'")[0],
      /data-display-profile='elo-touch'[\s\S]*?font-size:/,
    );
  });

  it('retains the Elo touch-target token for Focus actions', async () => {
    const focus = await read(
      'components/modules/TodaysFocus/TodaysFocus.css',
    );

    assert.match(
      focus,
      /data-display-profile='elo-touch'[\s\S]*?\.todays-focus__why-button\s*\{[^}]*min-width:\s*var\(--ey-touch-target-min\);[^}]*min-height:\s*var\(--ey-touch-target-min\);/,
    );
  });

  it('keeps Quick Status five-across with Elo-only spacing overrides', async () => {
    const css = await read(
      'components/modules/QuickStatus/QuickStatus.css',
    );

    assert.match(
      css,
      /grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\);/,
    );
    assert.match(
      css,
      /data-display-profile='elo-touch'[\s\S]*?--ey-status-card-min-height:\s*170px;/,
    );
  });
});
