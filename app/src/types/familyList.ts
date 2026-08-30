export type FamilyListSystemKey = 'shopping' | null;

export type FamilyListItem = {
  id: string;
  title: string;
  addedByProfileId: string;
  createdAt: string;
  updatedAt: string;
  checkedAt: string | null;
};

export type FamilyList = {
  id: string;
  systemKey: FamilyListSystemKey;
  name: string;
  active: boolean;
  items: FamilyListItem[];
  createdAt: string;
  updatedAt: string;
};

export type FamilyListStoreData = {
  schemaVersion: 1;
  lists: FamilyList[];
};

export type CreateFamilyListInput = {
  id: string;
  name: string;
};

export type CreateFamilyListItemInput = {
  id: string;
  title: string;
  addedByProfileId: string;
};
