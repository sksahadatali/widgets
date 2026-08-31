import { demoFamilyListStore } from '../lists/demoListStore';
import type {
  CreateFamilyListInput,
  CreateFamilyListItemInput,
  FamilyListStoreData,
} from '../types/familyList';
import { getAppMode } from './householdConfigService';
import { apiUrl } from './clientApi';

const REQUEST_TIMEOUT_MS = 15000;

type ListApiResponse =
  | { success: true; store?: FamilyListStoreData }
  | { success: false; error: string };

const json = (body: unknown): RequestInit => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

async function requestLists(
  path: string,
  init?: RequestInit
): Promise<ListApiResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await fetch(apiUrl(path), {
      ...init,
      signal: controller.signal,
    });
    const payload = await response.json() as ListApiResponse;
    if (!response.ok || !payload.success) {
      throw new Error(
        payload.success ? 'Lists are unavailable.' : payload.error
      );
    }
    return payload;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Lists are unavailable.',
      { cause: error }
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function loadLists(): Promise<FamilyListStoreData> {
  if (getAppMode() === 'demo') return demoFamilyListStore.read();
  const payload = await requestLists('/api/lists');
  if (!payload.success || !payload.store) {
    throw new Error('Lists are unavailable.');
  }
  return payload.store;
}

export async function createList(input: CreateFamilyListInput): Promise<void> {
  if (getAppMode() === 'demo') {
    demoFamilyListStore.createList(input);
    return;
  }
  await requestLists('/api/lists', { method: 'POST', ...json(input) });
}

export async function renameList(listId: string, name: string): Promise<void> {
  if (getAppMode() === 'demo') {
    demoFamilyListStore.renameList(listId, name);
    return;
  }
  await requestLists(`/api/lists/${encodeURIComponent(listId)}`, {
    method: 'PATCH',
    ...json({ name }),
  });
}

export async function setListActive(listId: string, active: boolean): Promise<void> {
  if (getAppMode() === 'demo') {
    demoFamilyListStore.setListActive(listId, active);
    return;
  }
  await requestLists(`/api/lists/${encodeURIComponent(listId)}/active`, {
    method: 'PATCH',
    ...json({ active }),
  });
}

export async function reorderLists(orderedIds: string[]): Promise<void> {
  if (getAppMode() === 'demo') {
    demoFamilyListStore.reorderLists(orderedIds);
    return;
  }
  await requestLists('/api/lists/order', {
    method: 'PATCH',
    ...json({ orderedIds }),
  });
}

export async function createListItem(
  listId: string,
  input: CreateFamilyListItemInput
): Promise<void> {
  if (getAppMode() === 'demo') {
    demoFamilyListStore.createItem(listId, input);
    return;
  }
  await requestLists(`/api/lists/${encodeURIComponent(listId)}/items`, {
    method: 'POST',
    ...json(input),
  });
}

export async function editListItem(
  listId: string,
  itemId: string,
  title: string
): Promise<void> {
  if (getAppMode() === 'demo') {
    demoFamilyListStore.editItem(listId, itemId, title);
    return;
  }
  await requestLists(
    `/api/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`,
    { method: 'PATCH', ...json({ title }) }
  );
}

export async function setListItemChecked(
  listId: string,
  itemId: string,
  checked: boolean
): Promise<void> {
  if (getAppMode() === 'demo') {
    demoFamilyListStore.setItemChecked(listId, itemId, checked);
    return;
  }
  await requestLists(
    `/api/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}/checked`,
    { method: 'PATCH', ...json({ checked }) }
  );
}

export async function removeListItem(listId: string, itemId: string): Promise<void> {
  if (getAppMode() === 'demo') {
    demoFamilyListStore.removeItem(listId, itemId);
    return;
  }
  await requestLists(
    `/api/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`,
    { method: 'DELETE' }
  );
}

export async function reorderListItems(
  listId: string,
  orderedIds: string[]
): Promise<void> {
  if (getAppMode() === 'demo') {
    demoFamilyListStore.reorderItems(listId, orderedIds);
    return;
  }
  await requestLists(`/api/lists/${encodeURIComponent(listId)}/items/order`, {
    method: 'PATCH',
    ...json({ orderedIds }),
  });
}

export async function clearCheckedListItems(listId: string): Promise<void> {
  if (getAppMode() === 'demo') {
    demoFamilyListStore.clearChecked(listId);
    return;
  }
  await requestLists(`/api/lists/${encodeURIComponent(listId)}/items/checked`, {
    method: 'DELETE',
  });
}
