import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import RewardsTabs, {
  type RewardsTab,
} from '../../app/src/components/rewards/RewardsTabs.tsx';

const appRoot = new URL('../../app/src/', import.meta.url);

async function read(relativePath: string) {
  return readFile(new URL(relativePath, appRoot), 'utf8');
}

type TestElement = {
  props: {
    children?: TestElement[];
    onClick?: () => void;
    'aria-selected'?: boolean;
  };
};

describe('Rewards compact workspace', () => {
  it('renders peer Rewards and Stars tabs and switches through their controls', () => {
    const selected: RewardsTab[] = [];
    const rewardsTree = RewardsTabs({
      activeTab: 'rewards',
      onTabChange: tab => selected.push(tab),
    }) as unknown as TestElement;
    const rewardsButtons = rewardsTree.props.children ?? [];

    assert.equal(rewardsButtons.length, 2);
    assert.equal(rewardsButtons[0].props['aria-selected'], true);
    assert.equal(rewardsButtons[1].props['aria-selected'], false);
    rewardsButtons[1].props.onClick?.();
    assert.deepEqual(selected, ['stars']);

    const starsTree = RewardsTabs({
      activeTab: 'stars',
      onTabChange: tab => selected.push(tab),
    }) as unknown as TestElement;
    const starsButtons = starsTree.props.children ?? [];
    assert.equal(starsButtons[0].props['aria-selected'], false);
    assert.equal(starsButtons[1].props['aria-selected'], true);
    starsButtons[0].props.onClick?.();
    assert.deepEqual(selected, ['stars', 'rewards']);
  });

  it('defaults to Rewards while keeping balances shared above the tab panel', async () => {
    const source = await read('pages/Rewards.tsx');

    assert.match(
      source,
      /useState<RewardsTab>\('rewards'\)/,
    );
    assert.ok(
      source.indexOf('reward-balances-strip') <
        source.indexOf('<RewardsTabs'),
    );
    assert.match(source, /<h2 id="reward-balances-title">Star balances<\/h2>/);
    assert.match(source, /activeTab === 'rewards'[\s\S]*?<RedemptionWorkspace/);
  });

  it('keeps required content and existing actions reachable in their tabs', async () => {
    const [page, redemptions] = await Promise.all([
      read('pages/Rewards.tsx'),
      read('components/rewards/RedemptionWorkspace.tsx'),
    ]);

    assert.match(page, /<h2 id="give-stars-title">Give Stars<\/h2>/);
    assert.match(page, /<h2 id="reward-history-title">Recent Activity<\/h2>/);
    assert.match(page, /Give \$\{amount \|\| '0'\} ★/);
    assert.match(page, /Reverse Award/);

    assert.match(redemptions, /<h2 id="rewards-list-title">Rewards List<\/h2>/);
    assert.match(redemptions, /'Redemption Requests'/);
    assert.match(redemptions, />\s*Manage Catalogue\s*</);
    assert.match(redemptions, /Request reward/);
    assert.match(redemptions, />\s*Approve\s*</);
    assert.match(redemptions, />\s*Decline\s*</);
    assert.match(redemptions, /Cancel and refund/);
    assert.match(redemptions, /canManage && catalogueOpen/);
    assert.doesNotMatch(
      redemptions,
      /canManage && \(\s*<section className="rewards-panel" aria-labelledby="manage-catalogue-title"/,
    );
  });

  it('fits Desktop and Elo with internal collection scrolling and a responsive fallback', async () => {
    const [pageCss, redemptionCss] = await Promise.all([
      read('pages/Rewards.css'),
      read('components/rewards/RedemptionWorkspace.css'),
    ]);

    assert.match(
      pageCss,
      /@media \(min-width: 1201px\) and \(min-height: 900px\)[\s\S]*\.app-main:has\(> \.rewards-page\)[\s\S]*height:\s*100dvh;[\s\S]*overflow:\s*hidden;/,
    );
    assert.match(
      pageCss,
      /\.rewards-stars-workspace\s*\{[^}]*align-items:\s*start;/s,
    );
    assert.match(
      redemptionCss,
      /\.redemption-workspace\s*\{[^}]*align-items:\s*start;/s,
    );
    assert.match(
      redemptionCss,
      /\.redemption-workspace > \.rewards-panel\s*\{[^}]*align-self:\s*start;[^}]*max-height:\s*100%;[^}]*overflow:\s*hidden;/s,
    );
    assert.match(
      redemptionCss,
      /\.redemption-catalogue,[\s\S]*\.redemption-requests\s*\{[^}]*flex:\s*0 1 auto;[^}]*overflow-y:\s*auto;/,
    );
    assert.match(
      pageCss,
      /\.rewards-panel--workspace\s*\{[^}]*height:\s*auto;/s,
    );
    assert.match(
      pageCss,
      /\.reward-history\s*\{[^}]*flex:\s*0 1 auto;[^}]*overflow-y:\s*auto;/s,
    );
    assert.match(
      pageCss,
      /:root\[data-display-profile='compact'\] \.rewards-stars-workspace\s*\{[^}]*grid-template-columns:\s*1fr;/s,
    );
    assert.match(
      redemptionCss,
      /:root\[data-display-profile='compact'\] \.redemption-workspace\s*\{[^}]*grid-template-columns:\s*1fr;[^}]*height:\s*auto;/s,
    );
    assert.match(
      pageCss,
      /\.rewards-tab\s*\{[^}]*min-height:\s*var\(--ey-touch-target-min\);/s,
    );
  });
});
