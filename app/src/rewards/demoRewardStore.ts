import exampleStore from '../data/rewards.example.json';
import type {
  RewardStoreData,
  RewardTransaction,
} from '../types/reward';

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
  return structuredClone(
    validateDemoRewardStore(exampleStore)
  );
}
