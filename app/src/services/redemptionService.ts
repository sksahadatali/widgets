import {
  cancelDemoRedemptionLifecycle,
  approveDemoRedemptionRequest,
  declineDemoRedemptionLifecycle,
  refundDemoRedemptionRequest,
} from '../redemptions/demoRedemptionAccounting';
import {
  createDemoCatalogueItem,
  createDemoRedemptionRequest,
  getDemoRedemptionStore,
  reorderDemoCatalogue,
  setDemoCatalogueItemActive,
  updateDemoCatalogueItem,
} from '../redemptions/demoRedemptionStore';
import type {
  CatalogueItemInput,
  CreateRedemptionRequestInput,
  RedemptionStoreData,
} from '../types/redemption';
import { getAppMode } from './householdConfigService';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:3001';
const REQUEST_TIMEOUT_MS = 15000;

type RedemptionApiResponse =
  | {
    success: true;
    store: RedemptionStoreData;
  }
  | {
    success: true;
    created: boolean;
    item?: unknown;
    request?: unknown;
  }
  | {
    success: false;
    error: string;
  };

async function requestRedemptions(
  path: string,
  init?: RequestInit
): Promise<RedemptionApiResponse> {
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
      await response.json() as RedemptionApiResponse;
    if (!response.ok || !payload.success) {
      throw new Error(
        payload.success
          ? 'Redemptions are unavailable.'
          : payload.error
      );
    }
    return payload;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : 'Redemptions are unavailable.',
      { cause: error }
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

const json = (body: unknown): RequestInit => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export async function loadRedemptions(): Promise<
  RedemptionStoreData
> {
  if (getAppMode() === 'demo') {
    return getDemoRedemptionStore();
  }
  const payload = await requestRedemptions(
    '/api/redemptions'
  );
  if (!('store' in payload)) {
    throw new Error('Redemptions are unavailable.');
  }
  return payload.store;
}

export async function createCatalogueItem(
  input: CatalogueItemInput
): Promise<void> {
  if (getAppMode() === 'demo') {
    createDemoCatalogueItem(input);
    return;
  }
  await requestRedemptions('/api/redemptions/catalogue', {
    method: 'POST',
    ...json(input),
  });
}

export async function updateCatalogueItem(
  itemId: string,
  input: Omit<CatalogueItemInput, 'id'>
): Promise<void> {
  if (getAppMode() === 'demo') {
    updateDemoCatalogueItem(itemId, input);
    return;
  }
  await requestRedemptions(
    `/api/redemptions/catalogue/${encodeURIComponent(itemId)}`,
    { method: 'PATCH', ...json(input) }
  );
}

export async function setCatalogueItemActive(
  itemId: string,
  active: boolean
): Promise<void> {
  if (getAppMode() === 'demo') {
    setDemoCatalogueItemActive(itemId, active);
    return;
  }
  await requestRedemptions(
    `/api/redemptions/catalogue/${encodeURIComponent(itemId)}/active`,
    { method: 'PATCH', ...json({ active }) }
  );
}

export async function reorderCatalogueItems(
  orderedIds: string[]
): Promise<void> {
  if (getAppMode() === 'demo') {
    reorderDemoCatalogue(orderedIds);
    return;
  }
  await requestRedemptions(
    '/api/redemptions/catalogue/order',
    { method: 'PUT', ...json({ orderedIds }) }
  );
}

export async function createRedemptionRequest(
  input: CreateRedemptionRequestInput
): Promise<void> {
  if (getAppMode() === 'demo') {
    createDemoRedemptionRequest(input);
    return;
  }
  await requestRedemptions('/api/redemptions/requests', {
    method: 'POST',
    ...json(input),
  });
}

export async function cancelRedemptionRequest(
  requestId: string,
  actorProfileId: string
): Promise<void> {
  if (getAppMode() === 'demo') {
    await cancelDemoRedemptionLifecycle(
      requestId,
      actorProfileId
    );
    return;
  }
  await requestRedemptions(
    `/api/redemptions/requests/${encodeURIComponent(requestId)}/cancel`,
    {
      method: 'POST',
      ...json({ actorProfileId }),
    }
  );
}

export async function declineRedemptionRequest(
  requestId: string,
  actorProfileId: string
): Promise<void> {
  if (getAppMode() === 'demo') {
    await declineDemoRedemptionLifecycle(
      requestId,
      actorProfileId
    );
    return;
  }
  await requestRedemptions(
    `/api/redemptions/requests/${encodeURIComponent(requestId)}/decline`,
    {
      method: 'POST',
      ...json({ actorProfileId }),
    }
  );
}

export async function approveRedemptionRequest(
  requestId: string,
  actorProfileId: string
): Promise<void> {
  if (getAppMode() === 'demo') {
    await approveDemoRedemptionRequest(
      requestId,
      actorProfileId
    );
  } else {
    await requestRedemptions(
      `/api/redemptions/requests/${encodeURIComponent(requestId)}/approve`,
      {
        method: 'POST',
        ...json({ actorProfileId }),
      }
    );
  }
  window.dispatchEvent(new Event('ey-rewards-changed'));
}

export async function refundRedemptionRequest(
  requestId: string,
  actorProfileId: string
): Promise<void> {
  if (getAppMode() === 'demo') {
    await refundDemoRedemptionRequest(
      requestId,
      actorProfileId
    );
  } else {
    await requestRedemptions(
      `/api/redemptions/requests/${encodeURIComponent(requestId)}/refund`,
      {
        method: 'POST',
        ...json({ actorProfileId }),
      }
    );
  }
  window.dispatchEvent(new Event('ey-rewards-changed'));
}
