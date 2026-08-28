import type {
  RewardStoreData,
} from '../types/reward';
import {
  getDemoRewardStore,
} from '../rewards/demoRewardStore';
import {
  getAppMode,
} from './householdConfigService';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:3001';
const REQUEST_TIMEOUT_MS = 15000;

type RewardApiResponse =
  | {
    success: true;
    store: RewardStoreData;
    balances: Record<string, number>;
  }
  | {
    success: false;
    error: string;
  };

export async function loadRewards(): Promise<
  RewardStoreData
> {
  if (getAppMode() === 'demo') {
    return getDemoRewardStore();
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/rewards`,
      { signal: controller.signal }
    );
    const payload =
      await response.json() as RewardApiResponse;

    if (!response.ok || !payload.success) {
      throw new Error(
        'Rewards are unavailable.'
      );
    }

    return payload.store;
  } catch (error) {
    throw new Error(
      'Rewards are unavailable.',
      { cause: error }
    );
  } finally {
    window.clearTimeout(timeout);
  }
}
