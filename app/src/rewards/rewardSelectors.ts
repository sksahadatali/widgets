import type {
  RewardTransaction,
} from '../types/reward';

function checkedAdd(
  current: number,
  amount: number
): number {
  const next = current + amount;

  if (!Number.isSafeInteger(next)) {
    throw new Error(
      'Reward balance exceeds the supported range.'
    );
  }

  return next;
}

export function getRewardBalance(
  transactions: RewardTransaction[],
  profileId: string
): number {
  return transactions
    .filter(
      transaction =>
        transaction.profileId === profileId
    )
    .reduce(
      (balance, transaction) =>
        checkedAdd(balance, transaction.amount),
      0
    );
}

export function getRewardBalances(
  transactions: RewardTransaction[]
): Record<string, number> {
  return transactions.reduce<Record<string, number>>(
    (balances, transaction) => {
      balances[transaction.profileId] = checkedAdd(
        balances[transaction.profileId] ?? 0,
        transaction.amount
      );
      return balances;
    },
    {}
  );
}

export function getRewardHistory(
  transactions: RewardTransaction[],
  profileId: string
): RewardTransaction[] {
  return transactions
    .filter(
      transaction =>
        transaction.profileId === profileId
    )
    .sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt)
    );
}
