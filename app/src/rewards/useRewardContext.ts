import {
  createContext,
  useContext,
} from 'react';

import type {
  ManualAwardInput,
  RewardReversalInput,
  RewardTransaction,
} from '../types/reward';

export type RewardContextValue = {
  transactions: RewardTransaction[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  giveStars: (
    input: ManualAwardInput
  ) => Promise<void>;
  reverseAward: (
    input: RewardReversalInput
  ) => Promise<void>;
};

export const RewardContext =
  createContext<RewardContextValue | null>(null);

export function useRewardContext(): RewardContextValue {
  const context = useContext(RewardContext);

  if (!context) {
    throw new Error(
      'useRewardContext must be used inside RewardProvider'
    );
  }

  return context;
}
