import exampleStore from '../data/rewards.example.json';
import type {
  ManualAwardInput,
  RewardReversalInput,
  RewardStoreData,
  RewardTransaction,
} from '../types/reward';
import {
  createManualAwardEventKey,
  createManualReversalEventKey,
  validateManualAward,
} from './manualRewards';

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isDemoTransaction(
  value: unknown
): value is RewardTransaction {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    Boolean(value.id) &&
    typeof value.profileId === 'string' &&
    Boolean(value.profileId) &&
    value.profileId !== 'family' &&
    (
      value.entryType === 'award' ||
      value.entryType === 'reversal' ||
      value.entryType === 'redemption'
    ) &&
    value.currency === 'star' &&
    Number.isSafeInteger(value.amount) &&
    Number(value.amount) !== 0 &&
    typeof value.category === 'string' &&
    (
      value.reason === null ||
      typeof value.reason === 'string'
    ) &&
    isRecord(value.source) &&
    typeof value.source.kind === 'string' &&
    typeof value.source.eventKey === 'string' &&
    (
      value.relation === null ||
      (
        isRecord(value.relation) &&
        (
          value.relation.kind === 'reversal-of' ||
          value.relation.kind === 'replacement-for'
        ) &&
        typeof value.relation.transactionId ===
          'string'
      )
    ) &&
    (
      value.actorProfileId === null ||
      typeof value.actorProfileId === 'string'
    ) &&
    typeof value.createdAt === 'string' &&
    typeof value.localDate === 'string' &&
    typeof value.timeZone === 'string'
  );
}

export function validateDemoRewardStore(
  value: unknown
): RewardStoreData {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.transactions) ||
    !value.transactions.every(isDemoTransaction)
  ) {
    throw new Error(
      'Safe Demo reward data is invalid.'
    );
  }

  const transactions =
    value.transactions as RewardTransaction[];

  if (
    new Set(
      transactions.map(
        transaction => transaction.id
      )
    ).size !== transactions.length ||
    new Set(
      transactions.map(
        transaction =>
          transaction.source.eventKey
      )
    ).size !== transactions.length
  ) {
    throw new Error(
      'Safe Demo reward data contains duplicate IDs.'
    );
  }

  return value as RewardStoreData;
}

export function getDemoRewardStore(): RewardStoreData {
  return structuredClone(demoStore);
}

let demoStore = structuredClone(
  validateDemoRewardStore(exampleStore)
);

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
  const getPart = (
    type: Intl.DateTimeFormatPartTypes
  ) => parts.find(part => part.type === type)?.value;

  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
}

export function appendDemoManualAward(
  input: ManualAwardInput,
  now = new Date()
): RewardTransaction {
  const normalized = validateManualAward(input);
  const eventKey = createManualAwardEventKey(
    normalized.requestId
  );
  const existing = demoStore.transactions.find(
    transaction =>
      transaction.source.eventKey === eventKey
  );

  if (existing) {
    if (
      existing.entryType === 'award' &&
      existing.profileId === normalized.profileId &&
      existing.amount === normalized.amount &&
      existing.category === normalized.category &&
      existing.reason === normalized.reason &&
      existing.actorProfileId ===
        normalized.actorProfileId &&
      existing.timeZone === normalized.timeZone
    ) {
      return structuredClone(existing);
    }

    throw new Error(
      'Reward request conflicts with an existing event.'
    );
  }

  const transaction: RewardTransaction = {
    id: crypto.randomUUID(),
    profileId: normalized.profileId,
    entryType: 'award',
    currency: 'star',
    amount: normalized.amount,
    category: normalized.category,
    reason: normalized.reason,
    source: {
      kind: 'manual-parent-award',
      eventKey,
    },
    relation: null,
    actorProfileId: normalized.actorProfileId,
    createdAt: now.toISOString(),
    localDate: getLocalDate(now, normalized.timeZone),
    timeZone: normalized.timeZone,
  };

  demoStore.transactions.push(transaction);
  validateDemoRewardStore(demoStore);

  return structuredClone(transaction);
}

export function reverseDemoManualAward(
  input: RewardReversalInput,
  now = new Date()
): RewardTransaction {
  const eventKey = createManualReversalEventKey(
    input.requestId.trim()
  );
  const existing = demoStore.transactions.find(
    transaction =>
      transaction.source.eventKey === eventKey
  );
  const target = demoStore.transactions.find(
    transaction => transaction.id === input.transactionId
  );

  if (!target) {
    throw new Error('Reward transaction was not found.');
  }

  if (existing) {
    if (
      existing.entryType === 'reversal' &&
      existing.relation?.kind === 'reversal-of' &&
      existing.relation.transactionId === target.id &&
      existing.actorProfileId === input.actorProfileId
    ) {
      return structuredClone(existing);
    }

    throw new Error(
      'Reward request conflicts with an existing event.'
    );
  }

  if (
    target.entryType !== 'award' ||
    target.source.kind !== 'manual-parent-award' ||
    demoStore.transactions.some(
      transaction =>
        transaction.relation?.kind === 'reversal-of' &&
        transaction.relation.transactionId === target.id
    )
  ) {
    throw new Error('This award cannot be reversed.');
  }

  const reversal: RewardTransaction = {
    id: crypto.randomUUID(),
    profileId: target.profileId,
    entryType: 'reversal',
    currency: 'star',
    amount: -target.amount,
    category: 'correction',
    reason: 'Manual award reversed',
    source: {
      kind: 'correction',
      eventKey,
      label: 'Reward reversal',
    },
    relation: {
      kind: 'reversal-of',
      transactionId: target.id,
    },
    actorProfileId: input.actorProfileId,
    createdAt: now.toISOString(),
    localDate: getLocalDate(now, input.timeZone),
    timeZone: input.timeZone,
  };

  demoStore.transactions.push(reversal);
  validateDemoRewardStore(demoStore);

  return structuredClone(reversal);
}

export function resetDemoRewardStore(): void {
  demoStore = structuredClone(
    validateDemoRewardStore(exampleStore)
  );
}
