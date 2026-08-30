import exampleStore from '../data/lists.example.json';
import type {
  CreateFamilyListInput,
  CreateFamilyListItemInput,
  FamilyList,
  FamilyListItem,
  FamilyListStoreData,
} from '../types/familyList';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isItem(value: unknown): value is FamilyListItem {
  return isRecord(value) &&
    typeof value.id === 'string' && UUID_PATTERN.test(value.id) &&
    typeof value.title === 'string' && Boolean(value.title.trim()) &&
    value.title === value.title.trim() && value.title.length <= 160 &&
    typeof value.addedByProfileId === 'string' &&
    Boolean(value.addedByProfileId.trim()) &&
    value.addedByProfileId.length <= 120 &&
    isTimestamp(value.createdAt) && isTimestamp(value.updatedAt) &&
    (value.checkedAt === null || isTimestamp(value.checkedAt));
}

function isList(value: unknown): value is FamilyList {
  return isRecord(value) &&
    typeof value.id === 'string' && UUID_PATTERN.test(value.id) &&
    (value.systemKey === null || value.systemKey === 'shopping') &&
    typeof value.name === 'string' && Boolean(value.name.trim()) &&
    value.name === value.name.trim() && value.name.length <= 60 &&
    typeof value.active === 'boolean' &&
    Array.isArray(value.items) && value.items.every(isItem) &&
    isTimestamp(value.createdAt) && isTimestamp(value.updatedAt);
}

export function validateDemoFamilyListStore(
  value: unknown
): FamilyListStoreData {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.lists) ||
    !value.lists.every(isList)
  ) {
    throw new Error('Safe Demo Lists data is invalid.');
  }
  const store = value as FamilyListStoreData;
  const listIds = store.lists.map(list => list.id.toLowerCase());
  const names = store.lists.map(list => list.name.toLowerCase());
  const itemIds = store.lists.flatMap(
    list => list.items.map(item => item.id.toLowerCase())
  );
  if (
    store.lists.filter(list => list.systemKey === 'shopping').length !== 1 ||
    new Set(listIds).size !== listIds.length ||
    new Set(names).size !== names.length ||
    new Set(itemIds).size !== itemIds.length
  ) {
    throw new Error('Safe Demo Lists data violates identity invariants.');
  }
  return store;
}

function normalizeUuid(value: string, label: string): string {
  if (!UUID_PATTERN.test(value)) throw new Error(`${label} is invalid.`);
  return value.toLowerCase();
}

function normalizeText(value: string, label: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new Error(`${label} must be from 1 to ${maximum} characters.`);
  }
  return normalized;
}

function requireList(store: FamilyListStoreData, listId: string): FamilyList {
  const list = store.lists.find(candidate => candidate.id === listId);
  if (!list) throw new Error('List was not found.');
  return list;
}

function ensureUniqueName(
  store: FamilyListStoreData,
  name: string,
  excludingId?: string
): void {
  if (store.lists.some(
    list => list.id !== excludingId &&
      list.name.toLowerCase() === name.toLowerCase()
  )) {
    throw new Error('A list with this name already exists.');
  }
}

function validateOrder(currentIds: string[], orderedIds: string[], label: string): string[] {
  const normalized = orderedIds.map(id => normalizeUuid(id, `${label} ID`));
  if (
    normalized.length !== currentIds.length ||
    new Set(normalized).size !== normalized.length ||
    normalized.some(id => !currentIds.includes(id))
  ) {
    throw new Error(`${label} order is stale. Reload Lists and try again.`);
  }
  return normalized;
}

export class DemoFamilyListStore {
  private store: FamilyListStoreData;

  constructor(initial: unknown = exampleStore) {
    this.store = structuredClone(validateDemoFamilyListStore(initial));
  }

  read(): FamilyListStoreData {
    return structuredClone(this.store);
  }

  private validate(): void {
    validateDemoFamilyListStore(this.store);
  }

  createList(input: CreateFamilyListInput, now = new Date()): void {
    const id = normalizeUuid(input.id, 'List ID');
    const name = normalizeText(input.name, 'List name', 60);
    const existing = this.store.lists.find(list => list.id === id);
    if (existing) {
      if (existing.systemKey === null && existing.name === name) return;
      throw new Error('List ID is already used by a different list.');
    }
    ensureUniqueName(this.store, name);
    const timestamp = now.toISOString();
    this.store.lists.push({
      id,
      systemKey: null,
      name,
      active: true,
      items: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    this.validate();
  }

  renameList(listId: string, nameValue: string, now = new Date()): void {
    const list = requireList(this.store, normalizeUuid(listId, 'List ID'));
    const name = normalizeText(nameValue, 'List name', 60);
    ensureUniqueName(this.store, name, list.id);
    if (list.name === name) return;
    list.name = name;
    list.updatedAt = now.toISOString();
    this.validate();
  }

  setListActive(listId: string, active: boolean, now = new Date()): void {
    if (typeof active !== 'boolean') throw new Error('List active state is invalid.');
    const list = requireList(this.store, normalizeUuid(listId, 'List ID'));
    if (list.active === active) return;
    list.active = active;
    list.updatedAt = now.toISOString();
    this.validate();
  }

  reorderLists(orderedIds: string[]): void {
    const current = this.store.lists.map(list => list.id);
    const normalized = validateOrder(current, orderedIds, 'List');
    if (normalized.every((id, index) => id === current[index])) return;
    const byId = new Map(this.store.lists.map(list => [list.id, list]));
    this.store.lists = normalized.map(id => byId.get(id)!);
    this.validate();
  }

  createItem(listId: string, input: CreateFamilyListItemInput, now = new Date()): void {
    const list = requireList(this.store, normalizeUuid(listId, 'List ID'));
    const id = normalizeUuid(input.id, 'Item ID');
    const title = normalizeText(input.title, 'Item title', 160);
    const addedByProfileId = normalizeText(
      input.addedByProfileId,
      'Added-by profile ID',
      120
    );
    const existing = this.store.lists
      .flatMap(candidate => candidate.items.map(item => ({ list: candidate, item })))
      .find(candidate => candidate.item.id === id);
    if (existing) {
      if (
        existing.list.id === list.id &&
        existing.item.title === title &&
        existing.item.addedByProfileId === addedByProfileId
      ) return;
      throw new Error('Item ID is already used by a different item.');
    }
    const timestamp = now.toISOString();
    list.items.push({
      id,
      title,
      addedByProfileId,
      createdAt: timestamp,
      updatedAt: timestamp,
      checkedAt: null,
    });
    list.updatedAt = timestamp;
    this.validate();
  }

  editItem(listId: string, itemId: string, titleValue: string, now = new Date()): void {
    const list = requireList(this.store, normalizeUuid(listId, 'List ID'));
    const item = list.items.find(
      candidate => candidate.id === normalizeUuid(itemId, 'Item ID')
    );
    if (!item) throw new Error('List item was not found.');
    const title = normalizeText(titleValue, 'Item title', 160);
    if (item.title === title) return;
    const timestamp = now.toISOString();
    item.title = title;
    item.updatedAt = timestamp;
    list.updatedAt = timestamp;
    this.validate();
  }

  setItemChecked(
    listId: string,
    itemId: string,
    checked: boolean,
    now = new Date()
  ): void {
    if (typeof checked !== 'boolean') throw new Error('Item checked state is invalid.');
    const list = requireList(this.store, normalizeUuid(listId, 'List ID'));
    const item = list.items.find(
      candidate => candidate.id === normalizeUuid(itemId, 'Item ID')
    );
    if (!item) throw new Error('List item was not found.');
    if ((item.checkedAt !== null) === checked) return;
    const timestamp = now.toISOString();
    item.checkedAt = checked ? timestamp : null;
    item.updatedAt = timestamp;
    list.updatedAt = timestamp;
    this.validate();
  }

  removeItem(listId: string, itemId: string, now = new Date()): void {
    const list = requireList(this.store, normalizeUuid(listId, 'List ID'));
    const id = normalizeUuid(itemId, 'Item ID');
    const index = list.items.findIndex(item => item.id === id);
    if (index < 0) {
      if (this.store.lists.some(
        candidate => candidate.id !== list.id &&
          candidate.items.some(item => item.id === id)
      )) throw new Error('List item was not found in this list.');
      return;
    }
    list.items.splice(index, 1);
    list.updatedAt = now.toISOString();
    this.validate();
  }

  reorderItems(listId: string, orderedIds: string[]): void {
    const list = requireList(this.store, normalizeUuid(listId, 'List ID'));
    const current = list.items.map(item => item.id);
    const normalized = validateOrder(current, orderedIds, 'Item');
    if (normalized.every((id, index) => id === current[index])) return;
    const byId = new Map(list.items.map(item => [item.id, item]));
    list.items = normalized.map(id => byId.get(id)!);
    this.validate();
  }

  clearChecked(listId: string, now = new Date()): number {
    const list = requireList(this.store, normalizeUuid(listId, 'List ID'));
    const remaining = list.items.filter(item => item.checkedAt === null);
    const removed = list.items.length - remaining.length;
    if (removed === 0) return 0;
    list.items = remaining;
    list.updatedAt = now.toISOString();
    this.validate();
    return removed;
  }
}

const demoFamilyListStore = new DemoFamilyListStore();

export function getDemoFamilyListStore(): FamilyListStoreData {
  return demoFamilyListStore.read();
}

export { demoFamilyListStore };
