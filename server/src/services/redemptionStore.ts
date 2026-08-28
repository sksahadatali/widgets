import { constants } from 'node:fs';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  CreateCatalogueItemInput,
  CreateRedemptionRequestInput,
  RedemptionRequest,
  RedemptionRequestClosure,
  RedemptionStoreData,
  RewardCatalogueItem,
  UpdateCatalogueItemInput,
} from '../types/redemption.js';

const DEFAULT_STORE_PATH = fileURLToPath(
  new URL(
    '../../data/redemptions.local.json',
    import.meta.url
  )
);

const EMPTY_STORE: RedemptionStoreData = {
  schemaVersion: 1,
  catalogue: [],
  requests: [],
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PROFILE_ID_LENGTH = 120;
const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 240;
const MIN_STAR_COST = 1;
const MAX_STAR_COST = 500;

type StoreUpdate<T> = {
  store: RedemptionStoreData;
  result: T;
  changed?: boolean;
};

export type CatalogueMutationResult = {
  item: RewardCatalogueItem;
  created: boolean;
};

export type RequestMutationResult = {
  request: RedemptionRequest;
  created: boolean;
};

export class RedemptionStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedemptionStoreError';
  }
}

export class RedemptionStoreCorruptError extends RedemptionStoreError {
  constructor(message: string) {
    super(message);
    this.name = 'RedemptionStoreCorruptError';
  }
}

export class RedemptionNotFoundError extends RedemptionStoreError {
  constructor(message: string) {
    super(message);
    this.name = 'RedemptionNotFoundError';
  }
}

export class RedemptionConflictError extends RedemptionStoreError {
  constructor(message: string) {
    super(message);
    this.name = 'RedemptionConflictError';
  }
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: string[]
): boolean {
  return Object.keys(value).every(key =>
    keys.includes(key)
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    UUID_PATTERN.test(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' &&
    !Number.isNaN(Date.parse(value));
}

function isTimeZone(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 120
  ) {
    return false;
  }

  try {
    new Intl.DateTimeFormat('en-GB', {
      timeZone: value,
    }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function isLocalDate(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !DATE_PATTERN.test(value)
  ) {
    return false;
  }

  const [year, month, day] = value
    .split('-')
    .map(Number);
  const candidate = new Date(
    Date.UTC(year, month - 1, day)
  );

  return candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day;
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

function isProfileId(value: unknown): value is string {
  return typeof value === 'string' &&
    Boolean(value.trim()) &&
    value.trim() !== 'family' &&
    value.length <= MAX_PROFILE_ID_LENGTH;
}

function isOptionalDescription(
  value: unknown
): value is string | null {
  return value === null ||
    (
      typeof value === 'string' &&
      Boolean(value.trim()) &&
      value.length <= MAX_DESCRIPTION_LENGTH
    );
}

function isStarCost(value: unknown): value is number {
  return Number.isInteger(value) &&
    Number(value) >= MIN_STAR_COST &&
    Number(value) <= MAX_STAR_COST;
}

function isCatalogueItem(
  value: unknown
): value is RewardCatalogueItem {
  return isRecord(value) &&
    hasOnlyKeys(value, [
      'id',
      'name',
      'description',
      'starCost',
      'active',
      'createdAt',
      'updatedAt',
    ]) &&
    isUuid(value.id) &&
    typeof value.name === 'string' &&
    Boolean(value.name.trim()) &&
    value.name.length <= MAX_NAME_LENGTH &&
    isOptionalDescription(value.description) &&
    isStarCost(value.starCost) &&
    typeof value.active === 'boolean' &&
    isIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.updatedAt) &&
    Date.parse(value.updatedAt) >= Date.parse(value.createdAt);
}

function isContract(value: unknown): boolean {
  return isRecord(value) &&
    hasOnlyKeys(value, [
      'catalogueItemId',
      'name',
      'description',
      'currency',
      'starCost',
    ]) &&
    isUuid(value.catalogueItemId) &&
    typeof value.name === 'string' &&
    Boolean(value.name.trim()) &&
    value.name.length <= MAX_NAME_LENGTH &&
    isOptionalDescription(value.description) &&
    value.currency === 'star' &&
    isStarCost(value.starCost);
}

function isClosure(
  value: unknown,
  requestId: string
): value is RedemptionRequestClosure | null {
  if (value === null) return true;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'kind',
      'eventKey',
      'actorProfileId',
      'occurredAt',
    ]) ||
    (
      value.kind !== 'cancelled' &&
      value.kind !== 'declined'
    ) ||
    value.eventKey !==
      `redemption-request:${requestId}:${
        value.kind === 'cancelled'
          ? 'cancel'
          : 'decline'
      }` ||
    !isProfileId(value.actorProfileId) ||
    !isIsoTimestamp(value.occurredAt)
  ) {
    return false;
  }

  return true;
}

function isRequest(
  value: unknown
): value is RedemptionRequest {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'id',
      'eventKey',
      'profileId',
      'requestedByProfileId',
      'contract',
      'requestedAt',
      'localDate',
      'timeZone',
      'closure',
    ]) ||
    !isUuid(value.id) ||
    value.eventKey !==
      `redemption-request:${value.id}` ||
    !isProfileId(value.profileId) ||
    value.requestedByProfileId !== value.profileId ||
    !isContract(value.contract) ||
    !isIsoTimestamp(value.requestedAt) ||
    !isLocalDate(value.localDate) ||
    !isTimeZone(value.timeZone) ||
    !isClosure(value.closure, value.id)
  ) {
    return false;
  }

  const requestedAt = new Date(value.requestedAt);
  if (
    getLocalDate(requestedAt, value.timeZone) !==
      value.localDate ||
    (
      value.closure !== null &&
      Date.parse(value.closure.occurredAt) <
        requestedAt.getTime()
    )
  ) {
    return false;
  }

  return true;
}

export function validateRedemptionStore(
  value: unknown
): RedemptionStoreData {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.catalogue) ||
    !value.catalogue.every(isCatalogueItem) ||
    !Array.isArray(value.requests) ||
    !value.requests.every(isRequest)
  ) {
    throw new RedemptionStoreCorruptError(
      'The local Redemption store is malformed or has an unsupported schema. It was not changed.'
    );
  }

  const store = value as RedemptionStoreData;
  const itemIds = store.catalogue.map(item => item.id);
  const requestIds = store.requests.map(request => request.id);
  const eventKeys = store.requests.flatMap(request => [
    request.eventKey,
    ...(request.closure
      ? [request.closure.eventKey]
      : []),
  ]);
  const itemIdSet = new Set(itemIds);

  if (
    itemIdSet.size !== itemIds.length ||
    new Set(requestIds).size !== requestIds.length ||
    new Set(eventKeys).size !== eventKeys.length ||
    store.requests.some(request =>
      !itemIdSet.has(
        request.contract.catalogueItemId
      )
    )
  ) {
    throw new RedemptionStoreCorruptError(
      'The local Redemption store violates identity invariants. It was not changed.'
    );
  }

  return store;
}

function normalizeUuid(
  value: unknown,
  field: string
): string {
  if (!isUuid(value)) {
    throw new RedemptionStoreError(
      `Redemption ${field} is invalid.`
    );
  }
  return value.toLowerCase();
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new RedemptionStoreError(
      'Catalogue name is required.'
    );
  }
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > MAX_NAME_LENGTH
  ) {
    throw new RedemptionStoreError(
      'Catalogue name must be from 1 to 80 characters.'
    );
  }
  return normalized;
}

function normalizeDescription(
  value: unknown
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new RedemptionStoreError(
      'Catalogue description is invalid.'
    );
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > MAX_DESCRIPTION_LENGTH) {
    throw new RedemptionStoreError(
      'Catalogue description must be 240 characters or fewer.'
    );
  }
  return normalized;
}

function normalizeStarCost(value: unknown): number {
  if (!isStarCost(value)) {
    throw new RedemptionStoreError(
      'Catalogue cost must be a whole number from 1 to 500 stars.'
    );
  }
  return Number(value);
}

function normalizeCatalogueInput(
  input: unknown,
  requireId: true
): CreateCatalogueItemInput;
function normalizeCatalogueInput(
  input: unknown,
  requireId: false
): UpdateCatalogueItemInput;
function normalizeCatalogueInput(
  input: unknown,
  requireId: boolean
): CreateCatalogueItemInput | UpdateCatalogueItemInput {
  if (!isRecord(input)) {
    throw new RedemptionStoreError(
      'Catalogue details are invalid.'
    );
  }
  const normalized = {
    name: normalizeName(input.name),
    description: normalizeDescription(
      input.description
    ),
    starCost: normalizeStarCost(input.starCost),
  };
  return requireId
    ? {
      id: normalizeUuid(input.id, 'catalogue ID'),
      ...normalized,
    }
    : normalized;
}

function normalizeProfileId(
  value: unknown,
  field: string
): string {
  if (!isProfileId(value)) {
    throw new RedemptionStoreError(
      `Redemption ${field} is invalid.`
    );
  }
  return value.trim();
}

function normalizeRequestInput(
  input: unknown
): CreateRedemptionRequestInput {
  if (!isRecord(input)) {
    throw new RedemptionStoreError(
      'Redemption request details are invalid.'
    );
  }
  const profileId = normalizeProfileId(
    input.profileId,
    'recipient'
  );
  const requestedByProfileId = normalizeProfileId(
    input.requestedByProfileId,
    'requestor'
  );
  if (profileId !== requestedByProfileId) {
    throw new RedemptionStoreError(
      'A Redemption request can only be created for the selected profile.'
    );
  }
  if (!isTimeZone(input.timeZone)) {
    throw new RedemptionStoreError(
      'Redemption timezone is invalid.'
    );
  }
  return {
    id: normalizeUuid(input.id, 'request ID'),
    catalogueItemId: normalizeUuid(
      input.catalogueItemId,
      'catalogue ID'
    ),
    profileId,
    requestedByProfileId,
    timeZone: input.timeZone.trim(),
  };
}

function equivalentCatalogueItem(
  item: RewardCatalogueItem,
  input: CreateCatalogueItemInput
): boolean {
  return item.id === input.id &&
    item.name === input.name &&
    item.description === input.description &&
    item.starCost === input.starCost;
}

function equivalentRequest(
  request: RedemptionRequest,
  input: CreateRedemptionRequestInput
): boolean {
  return request.id === input.id &&
    request.profileId === input.profileId &&
    request.requestedByProfileId ===
      input.requestedByProfileId &&
    request.contract.catalogueItemId ===
      input.catalogueItemId &&
    request.timeZone === input.timeZone;
}

async function fileExists(
  filePath: string
): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export class RedemptionFileStore {
  private writeQueue: Promise<void> =
    Promise.resolve();

  constructor(
    private readonly filePath = DEFAULT_STORE_PATH
  ) {}

  get backupPath(): string {
    return `${this.filePath}.bak`;
  }

  private async readExisting(): Promise<
    RedemptionStoreData | null
  > {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (
        isRecord(error) &&
        error.code === 'ENOENT'
      ) {
        return null;
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new RedemptionStoreCorruptError(
        'The local Redemption store is malformed. It was not changed.'
      );
    }
    return validateRedemptionStore(parsed);
  }

  private async replace(
    nextStore: RedemptionStoreData,
    retainBackup: boolean
  ): Promise<void> {
    validateRedemptionStore(nextStore);
    await mkdir(dirname(this.filePath), {
      recursive: true,
    });
    const suffix = `${process.pid}.${Date.now()}`;
    const temporaryPath =
      `${this.filePath}.${suffix}.tmp`;
    const backupTemporaryPath =
      `${this.backupPath}.${suffix}.tmp`;

    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify(nextStore, null, 2)}\n`,
        { encoding: 'utf8', flag: 'wx' }
      );
      if (
        retainBackup &&
        await fileExists(this.filePath)
      ) {
        await copyFile(
          this.filePath,
          backupTemporaryPath
        );
        await rename(
          backupTemporaryPath,
          this.backupPath
        );
      }
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      try {
        await unlink(temporaryPath);
      } catch {
        // The temporary file may already have been renamed.
      }
      try {
        await unlink(backupTemporaryPath);
      } catch {
        // The backup temporary file may already have been renamed.
      }
      throw error;
    }
  }

  private async mutate<T>(
    update: (
      store: RedemptionStoreData
    ) => StoreUpdate<T>
  ): Promise<T> {
    let operationResult: T | undefined;
    let operationError: unknown;

    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          const existing = await this.readExisting();
          const current = existing ??
            structuredClone(EMPTY_STORE);
          const updated = update(
            structuredClone(current)
          );
          validateRedemptionStore(updated.store);
          if (
            updated.changed !== false ||
            existing === null
          ) {
            await this.replace(
              updated.store,
              existing !== null
            );
          }
          operationResult = updated.result;
        } catch (error) {
          operationError = error;
        }
      });

    await this.writeQueue;
    if (operationError) throw operationError;
    return operationResult as T;
  }

  async read(): Promise<RedemptionStoreData> {
    return this.mutate(store => ({
      store,
      result: structuredClone(store),
      changed: false,
    }));
  }

  async createCatalogueItem(
    input: unknown,
    now = new Date()
  ): Promise<CatalogueMutationResult> {
    const normalized = normalizeCatalogueInput(
      input,
      true
    );
    return this.mutate<CatalogueMutationResult>(store => {
      const existing = store.catalogue.find(
        item => item.id === normalized.id
      );
      if (existing) {
        if (equivalentCatalogueItem(
          existing,
          normalized
        )) {
          return {
            store,
            result: {
              item: existing,
              created: false,
            },
            changed: false,
          };
        }
        throw new RedemptionConflictError(
          'Catalogue ID is already used by a different item.'
        );
      }
      const timestamp = now.toISOString();
      const item: RewardCatalogueItem = {
        ...normalized,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      store.catalogue.push(item);
      return {
        store,
        result: { item, created: true },
      };
    });
  }

  async updateCatalogueItem(
    itemId: string,
    input: unknown,
    now = new Date()
  ): Promise<CatalogueMutationResult> {
    const id = normalizeUuid(itemId, 'catalogue ID');
    const normalized = normalizeCatalogueInput(
      input,
      false
    );
    return this.mutate<CatalogueMutationResult>(store => {
      const item = store.catalogue.find(
        candidate => candidate.id === id
      );
      if (!item) {
        throw new RedemptionNotFoundError(
          'Catalogue item was not found.'
        );
      }
      if (
        item.name === normalized.name &&
        item.description === normalized.description &&
        item.starCost === normalized.starCost
      ) {
        return {
          store,
          result: { item, created: false },
          changed: false,
        };
      }
      item.name = normalized.name;
      item.description = normalized.description;
      item.starCost = normalized.starCost;
      item.updatedAt = now.toISOString();
      return {
        store,
        result: { item, created: false },
      };
    });
  }

  async setCatalogueItemActive(
    itemId: string,
    active: unknown,
    now = new Date()
  ): Promise<CatalogueMutationResult> {
    const id = normalizeUuid(itemId, 'catalogue ID');
    if (typeof active !== 'boolean') {
      throw new RedemptionStoreError(
        'Catalogue active state is invalid.'
      );
    }
    return this.mutate<CatalogueMutationResult>(store => {
      const item = store.catalogue.find(
        candidate => candidate.id === id
      );
      if (!item) {
        throw new RedemptionNotFoundError(
          'Catalogue item was not found.'
        );
      }
      if (item.active === active) {
        return {
          store,
          result: { item, created: false },
          changed: false,
        };
      }
      item.active = active;
      item.updatedAt = now.toISOString();
      return {
        store,
        result: { item, created: false },
      };
    });
  }

  async reorderCatalogue(
    orderedIds: unknown
  ): Promise<RedemptionStoreData> {
    if (
      !Array.isArray(orderedIds) ||
      !orderedIds.every(isUuid)
    ) {
      throw new RedemptionStoreError(
        'Catalogue order is invalid.'
      );
    }
    const normalized = orderedIds.map(id =>
      id.toLowerCase()
    );
    return this.mutate<RedemptionStoreData>(store => {
      const currentIds = store.catalogue.map(
        item => item.id
      );
      if (
        normalized.length !== currentIds.length ||
        new Set(normalized).size !== normalized.length ||
        normalized.some(id => !currentIds.includes(id))
      ) {
        throw new RedemptionStoreError(
          'Catalogue order must contain every item exactly once.'
        );
      }
      if (normalized.every(
        (id, index) => id === currentIds[index]
      )) {
        return {
          store,
          result: structuredClone(store),
          changed: false,
        };
      }
      const byId = new Map(
        store.catalogue.map(item => [item.id, item])
      );
      store.catalogue = normalized.map(id =>
        byId.get(id)!
      );
      return {
        store,
        result: structuredClone(store),
      };
    });
  }

  async createRequest(
    input: unknown,
    now = new Date()
  ): Promise<RequestMutationResult> {
    const normalized = normalizeRequestInput(input);
    return this.mutate<RequestMutationResult>(store => {
      const existing = store.requests.find(
        request => request.id === normalized.id
      );
      if (existing) {
        if (equivalentRequest(existing, normalized)) {
          return {
            store,
            result: {
              request: existing,
              created: false,
            },
            changed: false,
          };
        }
        throw new RedemptionConflictError(
          'Redemption request ID is already used by a different request.'
        );
      }
      const item = store.catalogue.find(
        candidate =>
          candidate.id === normalized.catalogueItemId
      );
      if (!item) {
        throw new RedemptionNotFoundError(
          'Catalogue item was not found.'
        );
      }
      if (!item.active) {
        throw new RedemptionConflictError(
          'This catalogue item is not currently active.'
        );
      }
      const requestedAt = now.toISOString();
      const request: RedemptionRequest = {
        id: normalized.id,
        eventKey:
          `redemption-request:${normalized.id}`,
        profileId: normalized.profileId,
        requestedByProfileId:
          normalized.requestedByProfileId,
        contract: {
          catalogueItemId: item.id,
          name: item.name,
          description: item.description,
          currency: 'star',
          starCost: item.starCost,
        },
        requestedAt,
        localDate: getLocalDate(
          now,
          normalized.timeZone
        ),
        timeZone: normalized.timeZone,
        closure: null,
      };
      store.requests.push(request);
      return {
        store,
        result: { request, created: true },
      };
    });
  }

  private async closeRequest(
    requestId: string,
    actorProfileId: unknown,
    kind: 'cancelled' | 'declined',
    now: Date
  ): Promise<RequestMutationResult> {
    const id = normalizeUuid(requestId, 'request ID');
    const actor = normalizeProfileId(
      actorProfileId,
      'actor'
    );
    return this.mutate<RequestMutationResult>(store => {
      const request = store.requests.find(
        candidate => candidate.id === id
      );
      if (!request) {
        throw new RedemptionNotFoundError(
          'Redemption request was not found.'
        );
      }
      if (
        kind === 'cancelled' &&
        (
          actor !== request.profileId ||
          actor !== request.requestedByProfileId
        )
      ) {
        throw new RedemptionStoreError(
          'A Redemption request can only be cancelled by its requesting profile.'
        );
      }
      const eventKey =
        `redemption-request:${id}:${
          kind === 'cancelled'
            ? 'cancel'
            : 'decline'
        }`;
      if (request.closure) {
        if (
          request.closure.kind === kind &&
          request.closure.eventKey === eventKey &&
          request.closure.actorProfileId === actor
        ) {
          return {
            store,
            result: {
              request,
              created: false,
            },
            changed: false,
          };
        }
        throw new RedemptionConflictError(
          'Redemption request is already closed.'
        );
      }
      request.closure = {
        kind,
        eventKey,
        actorProfileId: actor,
        occurredAt: now.toISOString(),
      };
      return {
        store,
        result: { request, created: true },
      };
    });
  }

  cancelRequest(
    requestId: string,
    actorProfileId: unknown,
    now = new Date()
  ): Promise<RequestMutationResult> {
    return this.closeRequest(
      requestId,
      actorProfileId,
      'cancelled',
      now
    );
  }

  declineRequest(
    requestId: string,
    actorProfileId: unknown,
    now = new Date()
  ): Promise<RequestMutationResult> {
    return this.closeRequest(
      requestId,
      actorProfileId,
      'declined',
      now
    );
  }
}

export const redemptionStore =
  new RedemptionFileStore();
