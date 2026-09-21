import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const homeStylesUrl = new URL(
  '../../app/src/pages/Home.css',
  import.meta.url,
);

async function readHomeStyles() {
  return readFile(homeStylesUrl, 'utf8');
}

describe('Home dashboard viewport fit', () => {
  it('uses the available wide-screen viewport without changing short-screen flow', async () => {
    const css = await readHomeStyles();

    assert.match(
      css,
      /@media \(min-width: 1201px\) and \(min-height: 900px\)/,
    );
    assert.match(
      css,
      /\.app-main:has\(> \.home\)\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s,
    );
    assert.match(
      css,
      /\) \.home\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\);[^}]*row-gap:\s*12px;[^}]*height:\s*100%;[^}]*overflow-y:\s*auto;/s,
    );

    const fitRuleIndex = css.indexOf(
      '@media (min-width: 1201px) and (min-height: 900px)',
    );
    assert.equal(
      css.slice(0, fitRuleIndex).includes('height: 100dvh'),
      false,
    );
  });

  it('lets bottom cards use the remaining row and retain card-owned scrolling', async () => {
    const css = await readHomeStyles();

    assert.match(
      css,
      /:is\(\s*\.home__due-soon,\s*\.home__tasks,\s*\.home__calendar\s*\)\s*\{\s*min-height:\s*0;/s,
    );
    assert.match(
      css,
      /:is\(\s*\.due-soon__list,\s*\.tasks__list,\s*\.calendar-card__agenda\s*\)\s*\{[^}]*flex:\s*1 1 0;[^}]*max-height:\s*none;[^}]*min-height:\s*0;/s,
    );
  });

  it('keeps task rows naturally stacked at the top of the flexible card', async () => {
    const css = await readHomeStyles();

    assert.match(
      css,
      /\.home \.tasks__list\s*\{\s*align-content:\s*start;/,
    );
  });

  it('reclaims non-interactive spacing while preserving profile touch targets', async () => {
    const css = await readHomeStyles();

    assert.match(
      css,
      /data-display-profile='desktop'[\s\S]*data-display-profile='elo-touch'/,
    );
    assert.match(
      css,
      /\.home \.todays-focus__item\s*\{[^}]*min-height:\s*var\(--ey-touch-target-min\);/s,
    );
    assert.match(
      css,
      /\.home \.todays-focus__why-button\s*\{[^}]*min-width:\s*var\(--ey-touch-target-min\);[^}]*min-height:\s*var\(--ey-touch-target-min\);/s,
    );
    assert.match(
      css,
      /\.home \.quick-status \.status-card\s*\{[^}]*min-height:\s*0;[^}]*padding-block:\s*14px;/s,
    );
  });
});
