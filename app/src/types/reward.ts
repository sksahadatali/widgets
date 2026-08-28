export type RewardCurrency = 'star';

export type ManualRewardCategory =
  | 'school'
  | 'kumon'
  | 'behaviour'
  | 'helping'
  | 'achievement'
  | 'other';

export type RewardCategory =
  | ManualRewardCategory
  | 'routine'
  | 'job'
  | 'redemption'
  | 'correction';

export type RewardSource =
  | {
    kind: 'manual-parent-award';
    eventKey: string;
  }
  | {
    kind: 'routine-completion';
    eventKey: string;
    routineId: string;
    occurrenceId: string;
    label: string;
  }
  | {
    kind: 'job-completion';
    eventKey: string;
    jobId: string;
    occurrenceId: string;
    label: string;
  }
  | {
    kind: 'redemption' | 'correction';
    eventKey: string;
    label: string;
  };

export type RewardTransaction = {
  id: string;
  profileId: string;
  entryType: 'award' | 'reversal' | 'redemption';
  currency: RewardCurrency;
  amount: number;
  category: RewardCategory;
  reason: string | null;
  source: RewardSource;
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

export type ManualAwardInput = {
  profileId: string;
  amount: number;
  category: ManualRewardCategory;
  reason: string;
  actorProfileId: string;
  timeZone: string;
  requestId: string;
};

export type RewardReversalInput = {
  transactionId: string;
  actorProfileId: string;
  timeZone: string;
  requestId: string;
};
