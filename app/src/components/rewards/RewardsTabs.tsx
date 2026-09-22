import * as React from 'react';
import {
  Gift,
  Star,
} from 'lucide-react';

export type RewardsTab = 'rewards' | 'stars';

type RewardsTabsProps = {
  activeTab: RewardsTab;
  onTabChange: (tab: RewardsTab) => void;
};

export default function RewardsTabs({
  activeTab,
  onTabChange,
}: RewardsTabsProps): React.ReactElement {
  return (
    <div
      className="rewards-tabs"
      role="tablist"
      aria-label="Rewards workspace"
    >
      <button
        type="button"
        id="rewards-tab-rewards"
        role="tab"
        aria-controls="rewards-panel-rewards"
        aria-selected={activeTab === 'rewards'}
        className={
          activeTab === 'rewards'
            ? 'rewards-tab rewards-tab--active'
            : 'rewards-tab'
        }
        onClick={() => onTabChange('rewards')}
      >
        <Gift size={19} aria-hidden="true" />
        Rewards
      </button>

      <button
        type="button"
        id="rewards-tab-stars"
        role="tab"
        aria-controls="rewards-panel-stars"
        aria-selected={activeTab === 'stars'}
        className={
          activeTab === 'stars'
            ? 'rewards-tab rewards-tab--active'
            : 'rewards-tab'
        }
        onClick={() => onTabChange('stars')}
      >
        <Star size={19} aria-hidden="true" />
        Stars
      </button>
    </div>
  );
}
