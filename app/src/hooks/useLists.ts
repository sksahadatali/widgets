import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  clearCheckedListItems,
  createList,
  createListItem,
  editListItem,
  loadLists,
  removeListItem,
  renameList,
  reorderListItems,
  reorderLists,
  setListActive,
  setListItemChecked,
} from '../services/listService';
import type {
  CreateFamilyListInput,
  CreateFamilyListItemInput,
  FamilyListStoreData,
} from '../types/familyList';

const EMPTY_STORE: FamilyListStoreData = {
  schemaVersion: 1,
  lists: [],
};

export function useLists() {
  const [store, setStore] = useState<FamilyListStoreData>(EMPTY_STORE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStore(await loadLists());
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Lists are unavailable.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadId = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(loadId);
  }, [refresh]);

  const runMutation = useCallback(async (mutation: () => Promise<void>) => {
    setSaving(true);
    try {
      await mutation();
      setStore(await loadLists());
      setError(null);
    } catch (mutationError) {
      const message = mutationError instanceof Error
        ? mutationError.message
        : 'Unable to update Lists.';
      setError(message);
      throw mutationError;
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    store,
    loading,
    saving,
    error,
    refresh,
    createList: (input: CreateFamilyListInput) =>
      runMutation(() => createList(input)),
    renameList: (listId: string, name: string) =>
      runMutation(() => renameList(listId, name)),
    setListActive: (listId: string, active: boolean) =>
      runMutation(() => setListActive(listId, active)),
    reorderLists: (orderedIds: string[]) =>
      runMutation(() => reorderLists(orderedIds)),
    createItem: (listId: string, input: CreateFamilyListItemInput) =>
      runMutation(() => createListItem(listId, input)),
    editItem: (listId: string, itemId: string, title: string) =>
      runMutation(() => editListItem(listId, itemId, title)),
    setItemChecked: (listId: string, itemId: string, checked: boolean) =>
      runMutation(() => setListItemChecked(listId, itemId, checked)),
    removeItem: (listId: string, itemId: string) =>
      runMutation(() => removeListItem(listId, itemId)),
    reorderItems: (listId: string, orderedIds: string[]) =>
      runMutation(() => reorderListItems(listId, orderedIds)),
    clearChecked: (listId: string) =>
      runMutation(() => clearCheckedListItems(listId)),
  };
}
