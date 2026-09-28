import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const appRoot = new URL('../../app/src/', import.meta.url);

async function read(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, appRoot), 'utf8');
}

describe('Elo Home presentation', () => {
  it('uses an approximately 60/40 top row on Desktop and Elo without changing the Compact allocation', async () => {
    const css = await read('pages/Home.css');

    assert.match(css, /grid-template-columns:\s*repeat\(12,/);
    assert.match(css, /\.home__brief\s*\{[^}]*grid-column:\s*span 8;/s);
    assert.match(css, /\.home__focus\s*\{[^}]*grid-column:\s*span 4;/s);
    assert.match(
      css,
      /@media \(min-width: 1201px\)[\s\S]*?data-display-profile='desktop'[\s\S]*?data-display-profile='elo-touch'[\s\S]*?\.home__brief\s*\{[^}]*grid-column:\s*span 7;[\s\S]*?\.home__focus\s*\{[^}]*grid-column:\s*span 5;/,
    );
    assert.match(
      css,
      /data-display-profile='compact'[\s\S]*?\.home__brief\s*\{[^}]*grid-column:\s*span 7;[\s\S]*?data-display-profile='compact'[\s\S]*?\.home__focus\s*\{[^}]*grid-column:\s*span 5;/,
    );
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

  it('uses compact wide rows with usable Focus action targets', async () => {
    const focus = await read(
      'components/modules/TodaysFocus/TodaysFocus.css',
    );

    assert.match(
      focus,
      /@media \(min-width: 1201px\)[\s\S]*?data-display-profile='desktop'[\s\S]*?data-display-profile='elo-touch'[\s\S]*?\.todays-focus__item\s*\{[^}]*min-height:\s*46px;[^}]*padding:\s*0;/,
    );
    assert.match(
      focus,
      /\.todays-focus__item-link,[\s\S]*?\.todays-focus__why-button\s*\{[^}]*min-height:\s*44px;/,
    );
    assert.match(
      focus,
      /data-display-profile='elo-touch'[\s\S]*?\.todays-focus__why-button\s*\{[^}]*min-width:\s*var\(--ey-touch-target-min\);/,
    );
    assert.doesNotMatch(
      focus,
      /\.todays-focus__item\s*\{[^}]*min-height:\s*var\(--ey-touch-target-min\);/,
    );
  });

  it('leaves Compact Focus row density unchanged', async () => {
    const focus = await read(
      'components/modules/TodaysFocus/TodaysFocus.css',
    );

    assert.match(
      focus,
      /data-display-profile='compact'[\s\S]*?\.todays-focus__item\s*\{[^}]*min-height:\s*38px;[^}]*padding:\s*4px 0;/,
    );
  });

  it('keeps Focus information on one truncation-safe row for wide Desktop and Elo profiles', async () => {
    const focus = await read(
      'components/modules/TodaysFocus/TodaysFocus.css',
    );

    assert.match(
      focus,
      /@media \(min-width: 1201px\)[\s\S]*?data-display-profile='desktop'[\s\S]*?data-display-profile='elo-touch'[\s\S]*?\.todays-focus__text\s*\{[^}]*flex-direction:\s*row;[^}]*align-items:\s*center;[^}]*overflow:\s*hidden;/,
    );
    assert.match(
      focus,
      /\.todays-focus__item-title\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-width:\s*0;/,
    );
    assert.match(
      focus,
      /\.todays-focus__item-meta\s*\{[^}]*flex:\s*0 0 auto;[^}]*margin-top:\s*0;/,
    );
    assert.match(
      focus,
      /\.todays-focus__text\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/,
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
