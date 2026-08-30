import type {
  FamilyList,
  FamilyListStoreData,
} from '../types/familyList';

export function selectActiveLists(
  store: FamilyListStoreData
): FamilyList[] {
  return store.lists.filter(list => list.active);
}

export function selectShoppingList(
  store: FamilyListStoreData
): FamilyList {
  const shopping = store.lists.find(
    list => list.systemKey === 'shopping'
  );
  if (!shopping) {
    throw new Error('Shopping list is unavailable.');
  }
  return shopping;
}
