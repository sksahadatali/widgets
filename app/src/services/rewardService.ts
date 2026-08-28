import type {
  ManualAwardInput,
  RewardReversalInput,
  RewardStoreData,
} from '../types/reward';
import {
  appendDemoManualAward,
  getDemoRewardStore,
  reverseDemoManualAward,
} from '../rewards/demoRewardStore';
import {
  createManualAwardEventKey,
  createManualReversalEventKey,
  validateManualAward,
} from '../rewards/manualRewards';
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
    transaction: unknown;
    created: boolean;
  }
  | {
    success: true;
    store: RewardStoreData;
    balances: Record<string, number>;
  }
  | {
    success: false;
    error: string;
  };

async function requestRewards(
  path: string,
  init?: RequestInit
): Promise<RewardApiResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      `${API_BASE_URL}${path}`,
      { ...init, signal: controller.signal }
    );
    const payload =
      await response.json() as RewardApiResponse;

    if (!response.ok || !payload.success) {
      throw new Error(
        payload.success
          ? 'Rewards are unavailable.'
          : payload.error
      );
    }

    return payload;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : 'Rewards are unavailable.',
      { cause: error }
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function loadRewards(): Promise<
  RewardStoreData
> {
  if (getAppMode() === 'demo') {
    return getDemoRewardStore();
  }

  const payload = await requestRewards(
    '/api/rewards'
  );

  if (!('store' in payload)) {
    throw new Error('Rewards are unavailable.');
  }

  return payload.store;
}

export async function createManualAward(
  input: ManualAwardInput
): Promise<void> {
  const normalized = validateManualAward(input);

  if (getAppMode() === 'demo') {
    appendDemoManualAward(normalized);
    return;
  }

  await requestRewards('/api/rewards/awards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileId: normalized.profileId,
      amount: normalized.amount,
      category: normalized.category,
      reason: normalized.reason,
      source: {
        kind: 'manual-parent-award',
        eventKey: createManualAwardEventKey(
          normalized.requestId
        ),
      },
      actorProfileId: normalized.actorProfileId,
      timeZone: normalized.timeZone,
    }),
  });
}

export async function reverseManualAward(
  input: RewardReversalInput
): Promise<void> {
  if (getAppMode() === 'demo') {
    reverseDemoManualAward(input);
    return;
  }

  await requestRewards(
    `/api/rewards/transactions/${encodeURIComponent(input.transactionId)}/reversal`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventKey: createManualReversalEventKey(
          input.requestId
        ),
        reason: 'Manual award reversed',
        actorProfileId: input.actorProfileId,
        timeZone: input.timeZone,
      }),
    }
  );
}
