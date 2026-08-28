export type RewardCurrency = 'star';

export type RewardEntryType =
  | 'award'
  | 'reversal'
  | 'redemption';

export type RewardCategory =
  | 'school'
  | 'kumon'
  | 'behaviour'
  | 'helping'
  | 'achievement'
  | 'other'
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
    kind: 'redemption';
    eventKey: string;
    label: string;
  }
  | {
    kind: 'correction';
    eventKey: string;
    label: string;
  };

export type RewardRelation =
  | {
    kind: 'reversal-of';
    transactionId: string;
  }
  | {
    kind: 'replacement-for';
    transactionId: string;
  };

export type RewardTransaction = {
  id: string;
  profileId: string;
  entryType: RewardEntryType;
  currency: RewardCurrency;
  amount: number;
  category: RewardCategory;
  reason: string | null;
  source: RewardSource;
  relation: RewardRelation | null;
  actorProfileId: string | null;
  createdAt: string;
  localDate: string;
  timeZone: string;
};

export type RewardStoreData = {
  schemaVersion: 1;
  transactions: RewardTransaction[];
};

export type RewardAwardInput = {
  profileId: string;
  amount: number;
  category: Exclude<
    RewardCategory,
    'redemption'
  >;
  reason: string | null;
  source: Exclude<
    RewardSource,
    { kind: 'redemption' }
  >;
  actorProfileId: string | null;
  timeZone: string;
};

export type RewardReversalInput = {
  eventKey: string;
  reason: string;
  actorProfileId: string | null;
  timeZone: string;
};
