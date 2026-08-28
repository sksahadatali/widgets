export type RewardCurrency = 'star';

export type RewardTransaction = {
  id: string;
  profileId: string;
  entryType: 'award' | 'reversal' | 'redemption';
  currency: RewardCurrency;
  amount: number;
  category: string;
  reason: string | null;
  source: {
    kind: string;
    eventKey: string;
    [key: string]: unknown;
  };
  relation: {
    kind: 'reversal-of' | 'replacement-for';
    transactionId: string;
  } | null;
  actorProfileId: string | null;
  createdAt: string;
  localDate: string;
  timeZone: string;
};

export type RewardStoreData = {
  schemaVersion: 1;
  transactions: RewardTransaction[];
};
