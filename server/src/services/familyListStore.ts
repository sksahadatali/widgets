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
import {
  getRuntimeStoreOptions,
  type StoreAccessPolicy,
} from '../config/runtimeData.js';

import type {
  CreateFamilyListInput,
  CreateFamilyListItemInput,
  FamilyList,
  FamilyListItem,
  FamilyListStoreData,
} from '../types/familyList.js';

export const SHOPPING_LIST_ID =
  '00000000-0000-4000-8000-000000000001';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_LIST_NAME_LENGTH = 60;
const MAX_ITEM_TITLE_LENGTH = 160;
const MAX_PROFILE_ID_LENGTH = 120;

type StoreUpdate<T> = {
  store: FamilyListStoreData;
  result: T;
  changed?: boolean;
};

export type ListMutationResult = {
  list: FamilyList;
  created: boolean;
};

export type ItemMutationResult = {
  item: FamilyListItem;
  created: boolean;
};

export type RemoveItemResult = {
  removed: boolean;
};

export type ClearCheckedResult = {
  removedCount: number;
};

export class FamilyListStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FamilyListStoreError';
  }
}

export class FamilyListStoreCorruptError extends FamilyListStoreError {
  constructor(message: string) {
    super(message);
    this.name = 'FamilyListStoreCorruptError';
  }
}

export class FamilyListNotFoundError extends FamilyListStoreError {
  constructor(message: string) {
    super(message);
    this.name = 'FamilyListNotFoundError';
  }
}

export class FamilyListConflictError extends FamilyListStoreError {
  constructor(message: string) {
    super(message);
    this.name = 'FamilyListConflictError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) &&
    value === new Date(parsed).toISOString();
}

function isNormalizedText(
  value: unknown,
  maxLength: number
): value is string {
  return typeof value === 'string' &&
    Boolean(value) &&
    value === value.trim() &&
    value.length <= maxLength;
}

function isProfileId(value: unknown): value is string {
  return isNormalizedText(value, MAX_PROFILE_ID_LENGTH);
}

function isFamilyListItem(value: unknown): value is FamilyListItem {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'id',
      'title',
      'addedByProfileId',
      'createdAt',
      'updatedAt',
      'checkedAt',
    ]) ||
    !isUuid(value.id) ||
    !isNormalizedText(value.title, MAX_ITEM_TITLE_LENGTH) ||
    !isProfileId(value.addedByProfileId) ||
    !isIsoTimestamp(value.createdAt) ||
    !isIsoTimestamp(value.updatedAt) ||
    (value.checkedAt !== null && !isIsoTimestamp(value.checkedAt))
  ) {
    return false;
  }

  const createdAt = Date.parse(value.createdAt);
  return Date.parse(value.updatedAt) >= createdAt &&
    (value.checkedAt === null || Date.parse(value.checkedAt) >= createdAt);
}

function isFamilyList(value: unknown): value is FamilyList {
  return isRecord(value) &&
    hasOnlyKeys(value, [
      'id',
      'systemKey',
      'name',
      'active',
      'items',
      'createdAt',
      'updatedAt',
    ]) &&
    isUuid(value.id) &&
    (value.systemKey === null || value.systemKey === 'shopping') &&
    isNormalizedText(value.name, MAX_LIST_NAME_LENGTH) &&
    typeof value.active === 'boolean' &&
    Array.isArray(value.items) &&
    value.items.every(isFamilyListItem) &&
    isIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.updatedAt) &&
    Date.parse(value.updatedAt) >= Date.parse(value.createdAt);
}

export function validateFamilyListStore(
  value: unknown
): FamilyListStoreData {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['schemaVersion', 'lists']) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.lists) ||
    !value.lists.every(isFamilyList)
  ) {
    throw new FamilyListStoreCorruptError(
      'The local Lists store is malformed or has an unsupported schema. It was not changed.'
    );
  }

  const store = value as FamilyListStoreData;
  const listIds = store.lists.map(list => list.id.toLowerCase());
  const listNames = store.lists.map(list => list.name.toLowerCase());
  const items = store.lists.flatMap(list => list.items);
  const itemIds = items.map(item => item.id.toLowerCase());
  const shoppingCount = store.lists.filter(
    list => list.systemKey === 'shopping'
  ).length;

  if (
    shoppingCount !== 1 ||
    new Set(listIds).size !== listIds.length ||
    new Set(listNames).size !== listNames.length ||
    new Set(itemIds).size !== itemIds.length
  ) {
    throw new FamilyListStoreCorruptError(
      'The local Lists store violates identity invariants. It was not changed.'
    );
  }

  return store;
}

function createInitialStore(now = new Date()): FamilyListStoreData {
  const timestamp = now.toISOString();
  return {
    schemaVersion: 1,
    lists: [{
      id: SHOPPING_LIST_ID,
      systemKey: 'shopping',
      name: 'Shopping',
      active: true,
      items: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
  };
}

function normalizeUuid(value: unknown, field: string): string {
  if (!isUuid(value)) {
    throw new FamilyListStoreError(`Lists ${field} is invalid.`);
  }
  return value.toLowerCase();
}

function normalizeText(
  value: unknown,
  field: string,
  maxLength: number
): string {
  if (typeof value !== 'string') {
    throw new FamilyListStoreError(`${field} is required.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new FamilyListStoreError(
      `${field} must be from 1 to ${maxLength} characters.`
    );
  }
  return normalized;
}

function normalizeProfileId(value: unknown): string {
  return normalizeText(value, 'Added-by profile ID', MAX_PROFILE_ID_LENGTH);
}

function normalizeCreateListInput(input: unknown): CreateFamilyListInput {
  if (!isRecord(input) || !hasOnlyKeys(input, ['id', 'name'])) {
    throw new FamilyListStoreError('List details are invalid.');
  }
  return {
    id: normalizeUuid(input.id, 'list ID'),
    name: normalizeText(input.name, 'List name', MAX_LIST_NAME_LENGTH),
  };
}

function normalizeCreateItemInput(input: unknown): CreateFamilyListItemInput {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, ['id', 'title', 'addedByProfileId'])
  ) {
    throw new FamilyListStoreError('List item details are invalid.');
  }
  return {
    id: normalizeUuid(input.id, 'item ID'),
    title: normalizeText(input.title, 'Item title', MAX_ITEM_TITLE_LENGTH),
    addedByProfileId: normalizeProfileId(input.addedByProfileId),
  };
}

function requireList(store: FamilyListStoreData, listId: string): FamilyList {
  const list = store.lists.find(candidate => candidate.id === listId);
  if (!list) {
    throw new FamilyListNotFoundError('List was not found.');
  }
  return list;
}

function ensureUniqueListName(
  store: FamilyListStoreData,
  name: string,
  excludingId?: string
): void {
  const normalized = name.toLowerCase();
  if (store.lists.some(
    list => list.id !== excludingId && list.name.toLowerCase() === normalized
  )) {
    throw new FamilyListConflictError('A list with this name already exists.');
  }
}

function normalizeOrder(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every(isUuid)) {
    throw new FamilyListStoreError(`${field} order is invalid.`);
  }
  return value.map(id => id.toLowerCase());
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export class FamilyListFileStore {
  private writeQueue: Promise<void> = Promise.resolve();

  private readonly filePath: string;
  private readonly accessPolicy: StoreAccessPolicy;

  constructor(
    filePath?: string,
    accessPolicy?: StoreAccessPolicy
  ) {
    const runtime = getRuntimeStoreOptions(
      'lists.local.json'
    );
    this.filePath = filePath ?? runtime.filePath;
    this.accessPolicy = accessPolicy ?? (
      filePath ? 'initialize' : runtime.policy
    );
  }

  get backupPath(): string {
    return `${this.filePath}.bak`;
  }

  private async readExisting(): Promise<FamilyListStoreData | null> {
    if (this.accessPolicy === 'disabled') {
      throw new FamilyListStoreError(
        'The Lists datastore is disabled in Demo mode.'
      );
    }

    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') {
        if (this.accessPolicy === 'required') {
          throw new FamilyListStoreError(
            'The required Lists datastore is missing.'
          );
        }
        return null;
      }
      throw error;
    }

    try {
      return validateFamilyListStore(JSON.parse(raw) as unknown);
    } catch (error) {
      if (error instanceof FamilyListStoreCorruptError) throw error;
      throw new FamilyListStoreCorruptError(
        'The local Lists store is malformed. It was not changed.'
      );
    }
  }

  private async replace(
    nextStore: FamilyListStoreData,
    retainBackup: boolean
  ): Promise<void> {
    validateFamilyListStore(nextStore);
    if (this.accessPolicy === 'initialize') {
      await mkdir(dirname(this.filePath), { recursive: true });
    }
    const suffix = `${process.pid}.${Date.now()}.${crypto.randomUUID()}`;
    const temporaryPath = `${this.filePath}.${suffix}.tmp`;
    const backupTemporaryPath = `${this.backupPath}.${suffix}.tmp`;

    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify(nextStore, null, 2)}\n`,
        { encoding: 'utf8', flag: 'wx' }
      );
      if (retainBackup && await fileExists(this.filePath)) {
        await copyFile(this.filePath, backupTemporaryPath);
        await rename(backupTemporaryPath, this.backupPath);
      }
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      await unlink(backupTemporaryPath).catch(() => undefined);
      throw error;
    }
  }

  private async mutate<T>(
    update: (store: FamilyListStoreData) => StoreUpdate<T>,
    now = new Date()
  ): Promise<T> {
    let operationResult: T | undefined;
    let operationError: unknown;

    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          const existing = await this.readExisting();
          const current = existing ?? createInitialStore(now);
          const updated = update(structuredClone(current));
          validateFamilyListStore(updated.store);
          if (updated.changed !== false || existing === null) {
            await this.replace(updated.store, existing !== null);
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

  async read(now = new Date()): Promise<FamilyListStoreData> {
    return this.mutate(store => ({
      store,
      result: structuredClone(store),
      changed: false,
    }), now);
  }

  async createList(
    input: unknown,
    now = new Date()
  ): Promise<ListMutationResult> {
    const normalized = normalizeCreateListInput(input);
    return this.mutate<ListMutationResult>(store => {
      const existing = store.lists.find(list => list.id === normalized.id);
      if (existing) {
        if (existing.systemKey === null && existing.name === normalized.name) {
          return {
            store,
            result: { list: existing, created: false },
            changed: false,
          };
        }
        throw new FamilyListConflictError(
          'List ID is already used by a different list.'
        );
      }
      ensureUniqueListName(store, normalized.name);
      const timestamp = now.toISOString();
      const list: FamilyList = {
        id: normalized.id,
        systemKey: null,
        name: normalized.name,
        active: true,
        items: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      store.lists.push(list);
      return { store, result: { list, created: true } };
    }, now);
  }

  async renameList(
    listId: string,
    name: unknown,
    now = new Date()
  ): Promise<ListMutationResult> {
    const id = normalizeUuid(listId, 'list ID');
    const normalizedName = normalizeText(name, 'List name', MAX_LIST_NAME_LENGTH);
    return this.mutate<ListMutationResult>(store => {
      const list = requireList(store, id);
      ensureUniqueListName(store, normalizedName, id);
      if (list.name === normalizedName) {
        return {
          store,
          result: { list, created: false },
          changed: false,
        };
      }
      list.name = normalizedName;
      list.updatedAt = now.toISOString();
      return { store, result: { list, created: false } };
    }, now);
  }

  async setListActive(
    listId: string,
    active: unknown,
    now = new Date()
  ): Promise<ListMutationResult> {
    const id = normalizeUuid(listId, 'list ID');
    if (typeof active !== 'boolean') {
      throw new FamilyListStoreError('List active state is invalid.');
    }
    return this.mutate<ListMutationResult>(store => {
      const list = requireList(store, id);
      if (list.active === active) {
        return {
          store,
          result: { list, created: false },
          changed: false,
        };
      }
      list.active = active;
      list.updatedAt = now.toISOString();
      return { store, result: { list, created: false } };
    }, now);
  }

  async reorderLists(orderedIds: unknown): Promise<FamilyListStoreData> {
    const normalized = normalizeOrder(orderedIds, 'List');
    return this.mutate(store => {
      const currentIds = store.lists.map(list => list.id);
      if (
        normalized.length !== currentIds.length ||
        new Set(normalized).size !== normalized.length ||
        normalized.some(id => !currentIds.includes(id))
      ) {
        throw new FamilyListConflictError(
          'List order is stale. Reload Lists and try again.'
        );
      }
      if (normalized.every((id, index) => id === currentIds[index])) {
        return { store, result: structuredClone(store), changed: false };
      }
      const byId = new Map(store.lists.map(list => [list.id, list]));
      store.lists = normalized.map(id => byId.get(id)!);
      return { store, result: structuredClone(store) };
    });
  }

  async createItem(
    listId: string,
    input: unknown,
    now = new Date()
  ): Promise<ItemMutationResult> {
    const id = normalizeUuid(listId, 'list ID');
    const normalized = normalizeCreateItemInput(input);
    return this.mutate<ItemMutationResult>(store => {
      const list = requireList(store, id);
      const existing = store.lists
        .flatMap(candidate => candidate.items.map(item => ({ list: candidate, item })))
        .find(candidate => candidate.item.id === normalized.id);
      if (existing) {
        if (
          existing.list.id === id &&
          existing.item.title === normalized.title &&
          existing.item.addedByProfileId === normalized.addedByProfileId
        ) {
          return {
            store,
            result: { item: existing.item, created: false },
            changed: false,
          };
        }
        throw new FamilyListConflictError(
          'Item ID is already used by a different item.'
        );
      }
      const timestamp = now.toISOString();
      const item: FamilyListItem = {
        ...normalized,
        createdAt: timestamp,
        updatedAt: timestamp,
        checkedAt: null,
      };
      list.items.push(item);
      list.updatedAt = timestamp;
      return { store, result: { item, created: true } };
    }, now);
  }

  async editItem(
    listId: string,
    itemId: string,
    title: unknown,
    now = new Date()
  ): Promise<ItemMutationResult> {
    const id = normalizeUuid(listId, 'list ID');
    const normalizedItemId = normalizeUuid(itemId, 'item ID');
    const normalizedTitle = normalizeText(title, 'Item title', MAX_ITEM_TITLE_LENGTH);
    return this.mutate(store => {
      const list = requireList(store, id);
      const item = list.items.find(candidate => candidate.id === normalizedItemId);
      if (!item) throw new FamilyListNotFoundError('List item was not found.');
      if (item.title === normalizedTitle) {
        return {
          store,
          result: { item, created: false },
          changed: false,
        };
      }
      const timestamp = now.toISOString();
      item.title = normalizedTitle;
      item.updatedAt = timestamp;
      list.updatedAt = timestamp;
      return { store, result: { item, created: false } };
    }, now);
  }

  async setItemChecked(
    listId: string,
    itemId: string,
    checked: unknown,
    now = new Date()
  ): Promise<ItemMutationResult> {
    const id = normalizeUuid(listId, 'list ID');
    const normalizedItemId = normalizeUuid(itemId, 'item ID');
    if (typeof checked !== 'boolean') {
      throw new FamilyListStoreError('Item checked state is invalid.');
    }
    return this.mutate(store => {
      const list = requireList(store, id);
      const item = list.items.find(candidate => candidate.id === normalizedItemId);
      if (!item) throw new FamilyListNotFoundError('List item was not found.');
      if ((item.checkedAt !== null) === checked) {
        return {
          store,
          result: { item, created: false },
          changed: false,
        };
      }
      const timestamp = now.toISOString();
      item.checkedAt = checked ? timestamp : null;
      item.updatedAt = timestamp;
      list.updatedAt = timestamp;
      return { store, result: { item, created: false } };
    }, now);
  }

  async removeItem(
    listId: string,
    itemId: string,
    now = new Date()
  ): Promise<RemoveItemResult> {
    const id = normalizeUuid(listId, 'list ID');
    const normalizedItemId = normalizeUuid(itemId, 'item ID');
    return this.mutate<RemoveItemResult>(store => {
      const list = requireList(store, id);
      const index = list.items.findIndex(item => item.id === normalizedItemId);
      if (index < 0) {
        const existsElsewhere = store.lists.some(
          candidate => candidate.id !== id &&
            candidate.items.some(item => item.id === normalizedItemId)
        );
        if (existsElsewhere) {
          throw new FamilyListNotFoundError('List item was not found in this list.');
        }
        return { store, result: { removed: false }, changed: false };
      }
      list.items.splice(index, 1);
      list.updatedAt = now.toISOString();
      return { store, result: { removed: true } };
    }, now);
  }

  async reorderItems(
    listId: string,
    orderedIds: unknown
  ): Promise<FamilyListStoreData> {
    const id = normalizeUuid(listId, 'list ID');
    const normalized = normalizeOrder(orderedIds, 'Item');
    return this.mutate(store => {
      const list = requireList(store, id);
      const currentIds = list.items.map(item => item.id);
      if (
        normalized.length !== currentIds.length ||
        new Set(normalized).size !== normalized.length ||
        normalized.some(itemId => !currentIds.includes(itemId))
      ) {
        throw new FamilyListConflictError(
          'Item order is stale. Reload Lists and try again.'
        );
      }
      if (normalized.every((itemId, index) => itemId === currentIds[index])) {
        return { store, result: structuredClone(store), changed: false };
      }
      const byId = new Map(list.items.map(item => [item.id, item]));
      list.items = normalized.map(itemId => byId.get(itemId)!);
      return { store, result: structuredClone(store) };
    });
  }

  async clearChecked(
    listId: string,
    now = new Date()
  ): Promise<ClearCheckedResult> {
    const id = normalizeUuid(listId, 'list ID');
    return this.mutate(store => {
      const list = requireList(store, id);
      const remaining = list.items.filter(item => item.checkedAt === null);
      const removedCount = list.items.length - remaining.length;
      if (removedCount === 0) {
        return { store, result: { removedCount: 0 }, changed: false };
      }
      list.items = remaining;
      list.updatedAt = now.toISOString();
      return { store, result: { removedCount } };
    }, now);
  }
}

export const familyListStore = new FamilyListFileStore();
