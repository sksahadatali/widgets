import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  createManualAward,
  loadRewards,
  reverseManualAward,
} from '../services/rewardService';
import type {
  ManualAwardInput,
  RewardReversalInput,
  RewardTransaction,
} from '../types/reward';
import {
  RewardContext,
  type RewardContextValue,
} from './useRewardContext';

export function RewardProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [transactions, setTransactions] =
    useState<RewardTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] =
    useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const store = await loadRewards();
      setTransactions(store.transactions);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Rewards are unavailable.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadId = window.setTimeout(
      () => void refresh(),
      0
    );

    return () => window.clearTimeout(loadId);
  }, [refresh]);

  useEffect(() => {
    const handleRewardsChanged = () => {
      void refresh();
    };
    window.addEventListener(
      'ey-rewards-changed',
      handleRewardsChanged
    );
    return () => window.removeEventListener(
      'ey-rewards-changed',
      handleRewardsChanged
    );
  }, [refresh]);

  const runMutation = useCallback(
    async (
      mutation: () => Promise<void>
    ) => {
      setSaving(true);

      try {
        await mutation();
        const store = await loadRewards();
        setTransactions(store.transactions);
        setError(null);
      } catch (mutationError) {
        setError(
          mutationError instanceof Error
            ? mutationError.message
            : 'Unable to update Rewards.'
        );
        throw mutationError;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const giveStars = useCallback(
    (input: ManualAwardInput) =>
      runMutation(() => createManualAward(input)),
    [runMutation]
  );

  const reverseAward = useCallback(
    (input: RewardReversalInput) =>
      runMutation(() => reverseManualAward(input)),
    [runMutation]
  );

  const value = useMemo<RewardContextValue>(
    () => ({
      transactions,
      loading,
      saving,
      error,
      refresh,
      giveStars,
      reverseAward,
    }),
    [
      transactions,
      loading,
      saving,
      error,
      refresh,
      giveStars,
      reverseAward,
    ]
  );

  return (
    <RewardContext.Provider value={value}>
      {children}
    </RewardContext.Provider>
  );
}
