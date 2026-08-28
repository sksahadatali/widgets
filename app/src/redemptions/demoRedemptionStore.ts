import exampleStore from '../data/redemptions.example.json';
import type {
  CatalogueItemInput,
  CreateRedemptionRequestInput,
  RedemptionRequest,
  RedemptionStoreData,
  RewardCatalogueItem,
} from '../types/redemption';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value);
}

function getLocalDate(
  instant: Date,
  timeZone: string
): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (
    type: Intl.DateTimeFormatPartTypes
  ) => parts.find(candidate =>
    candidate.type === type
  )?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function isItem(
  value: unknown
): value is RewardCatalogueItem {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    UUID_PATTERN.test(value.id) &&
    typeof value.name === 'string' &&
    Boolean(value.name.trim()) &&
    value.name.length <= 80 &&
    (
      value.description === null ||
      typeof value.description === 'string' &&
      Boolean(value.description.trim()) &&
      value.description.length <= 240
    ) &&
    Number.isInteger(value.starCost) &&
    Number(value.starCost) >= 1 &&
    Number(value.starCost) <= 500 &&
    typeof value.active === 'boolean' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string';
}

function isRequest(
  value: unknown
): value is RedemptionRequest {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    UUID_PATTERN.test(value.id) &&
    value.eventKey ===
      `redemption-request:${value.id}` &&
    typeof value.profileId === 'string' &&
    value.profileId !== 'family' &&
    value.requestedByProfileId === value.profileId &&
    isRecord(value.contract) &&
    typeof value.contract.catalogueItemId === 'string' &&
    typeof value.contract.name === 'string' &&
    value.contract.currency === 'star' &&
    Number.isInteger(value.contract.starCost) &&
    Number(value.contract.starCost) >= 1 &&
    Number(value.contract.starCost) <= 500 &&
    typeof value.requestedAt === 'string' &&
    typeof value.localDate === 'string' &&
    typeof value.timeZone === 'string' &&
    (
      value.closure === null ||
      isRecord(value.closure) &&
      (
        value.closure.kind === 'cancelled' ||
        value.closure.kind === 'declined'
      ) &&
      typeof value.closure.eventKey === 'string' &&
      typeof value.closure.actorProfileId === 'string' &&
      typeof value.closure.occurredAt === 'string'
    );
}

export function validateDemoRedemptionStore(
  value: unknown
): RedemptionStoreData {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.catalogue) ||
    !value.catalogue.every(isItem) ||
    !Array.isArray(value.requests) ||
    !value.requests.every(isRequest)
  ) {
    throw new Error(
      'Safe Demo Redemption data is invalid.'
    );
  }
  const store = value as RedemptionStoreData;
  const itemIds = store.catalogue.map(item => item.id);
  const requestIds = store.requests.map(request => request.id);
  if (
    new Set(itemIds).size !== itemIds.length ||
    new Set(requestIds).size !== requestIds.length
  ) {
    throw new Error(
      'Safe Demo Redemption data contains duplicate IDs.'
    );
  }
  return store;
}

let demoStore = structuredClone(
  validateDemoRedemptionStore(exampleStore)
);

function normalizeItemInput(
  input: CatalogueItemInput
): CatalogueItemInput {
  const name = input.name.trim();
  const description = input.description?.trim() || null;
  if (
    !UUID_PATTERN.test(input.id) ||
    !name ||
    name.length > 80 ||
    description && description.length > 240 ||
    !Number.isInteger(input.starCost) ||
    input.starCost < 1 ||
    input.starCost > 500
  ) {
    throw new Error('Catalogue details are invalid.');
  }
  return {
    id: input.id.toLowerCase(),
    name,
    description,
    starCost: input.starCost,
  };
}

export function getDemoRedemptionStore(): RedemptionStoreData {
  return structuredClone(demoStore);
}

export function createDemoCatalogueItem(
  input: CatalogueItemInput,
  now = new Date()
): void {
  const normalized = normalizeItemInput(input);
  const existing = demoStore.catalogue.find(
    item => item.id === normalized.id
  );
  if (existing) {
    if (
      existing.name === normalized.name &&
      existing.description === normalized.description &&
      existing.starCost === normalized.starCost
    ) return;
    throw new Error(
      'Catalogue ID conflicts with an existing item.'
    );
  }
  const timestamp = now.toISOString();
  demoStore.catalogue.push({
    ...normalized,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  validateDemoRedemptionStore(demoStore);
}

export function updateDemoCatalogueItem(
  itemId: string,
  input: Omit<CatalogueItemInput, 'id'>,
  now = new Date()
): void {
  const item = demoStore.catalogue.find(
    candidate => candidate.id === itemId
  );
  if (!item) throw new Error('Catalogue item was not found.');
  const normalized = normalizeItemInput({
    id: itemId,
    ...input,
  });
  if (
    item.name === normalized.name &&
    item.description === normalized.description &&
    item.starCost === normalized.starCost
  ) return;
  item.name = normalized.name;
  item.description = normalized.description;
  item.starCost = normalized.starCost;
  item.updatedAt = now.toISOString();
  validateDemoRedemptionStore(demoStore);
}

export function setDemoCatalogueItemActive(
  itemId: string,
  active: boolean,
  now = new Date()
): void {
  const item = demoStore.catalogue.find(
    candidate => candidate.id === itemId
  );
  if (!item) throw new Error('Catalogue item was not found.');
  if (item.active === active) return;
  item.active = active;
  item.updatedAt = now.toISOString();
  validateDemoRedemptionStore(demoStore);
}

export function reorderDemoCatalogue(
  orderedIds: string[]
): void {
  const current = demoStore.catalogue.map(item => item.id);
  if (
    orderedIds.length !== current.length ||
    new Set(orderedIds).size !== orderedIds.length ||
    orderedIds.some(id => !current.includes(id))
  ) throw new Error('Catalogue order is invalid.');
  const byId = new Map(
    demoStore.catalogue.map(item => [item.id, item])
  );
  demoStore.catalogue = orderedIds.map(id => byId.get(id)!);
  validateDemoRedemptionStore(demoStore);
}

export function createDemoRedemptionRequest(
  input: CreateRedemptionRequestInput,
  now = new Date()
): void {
  if (
    !UUID_PATTERN.test(input.id) ||
    !input.profileId.trim() ||
    input.profileId === 'family' ||
    input.requestedByProfileId !== input.profileId
  ) throw new Error('Redemption request details are invalid.');
  const existing = demoStore.requests.find(
    request => request.id === input.id
  );
  if (existing) {
    if (
      existing.profileId === input.profileId &&
      existing.requestedByProfileId === input.requestedByProfileId &&
      existing.contract.catalogueItemId === input.catalogueItemId &&
      existing.timeZone === input.timeZone
    ) return;
    throw new Error(
      'Redemption request conflicts with an existing event.'
    );
  }
  const item = demoStore.catalogue.find(
    candidate => candidate.id === input.catalogueItemId
  );
  if (!item) throw new Error('Catalogue item was not found.');
  if (!item.active) throw new Error('Catalogue item is inactive.');
  demoStore.requests.push({
    id: input.id.toLowerCase(),
    eventKey: `redemption-request:${input.id.toLowerCase()}`,
    profileId: input.profileId,
    requestedByProfileId: input.requestedByProfileId,
    contract: {
      catalogueItemId: item.id,
      name: item.name,
      description: item.description,
      currency: 'star',
      starCost: item.starCost,
    },
    requestedAt: now.toISOString(),
    localDate: getLocalDate(now, input.timeZone),
    timeZone: input.timeZone,
    closure: null,
  });
  validateDemoRedemptionStore(demoStore);
}

function closeDemoRequest(
  requestId: string,
  actorProfileId: string,
  kind: 'cancelled' | 'declined',
  now: Date
): void {
  const request = demoStore.requests.find(
    candidate => candidate.id === requestId
  );
  if (!request) throw new Error('Redemption request was not found.');
  if (
    kind === 'cancelled' &&
    actorProfileId !== request.profileId
  ) throw new Error('Only the requesting profile can cancel.');
  if (actorProfileId === 'family' || !actorProfileId.trim()) {
    throw new Error('Redemption actor is invalid.');
  }
  if (request.closure) {
    if (
      request.closure.kind === kind &&
      request.closure.actorProfileId === actorProfileId
    ) return;
    throw new Error('Redemption request is already closed.');
  }
  request.closure = {
    kind,
    eventKey:
      `redemption-request:${request.id}:${kind === 'cancelled' ? 'cancel' : 'decline'}`,
    actorProfileId,
    occurredAt: now.toISOString(),
  };
  validateDemoRedemptionStore(demoStore);
}

export function cancelDemoRedemptionRequest(
  requestId: string,
  actorProfileId: string,
  now = new Date()
): void {
  closeDemoRequest(
    requestId,
    actorProfileId,
    'cancelled',
    now
  );
}

export function declineDemoRedemptionRequest(
  requestId: string,
  actorProfileId: string,
  now = new Date()
): void {
  closeDemoRequest(
    requestId,
    actorProfileId,
    'declined',
    now
  );
}

export function resetDemoRedemptionStore(): void {
  demoStore = structuredClone(
    validateDemoRedemptionStore(exampleStore)
  );
}
