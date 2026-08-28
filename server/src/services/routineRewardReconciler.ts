import { randomUUID } from 'node:crypto';

import type { RewardTransaction } from '../types/reward.js';
import type { RoutineOccurrence } from '../types/routine.js';
import {
  RewardFileStore,
  rewardStore,
} from './rewardStore.js';
import {
  RoutineFileStore,
  routineStore,
} from './routineStore.js';

const AWARD_PREFIX = 'routine-occurrence:';

export type RoutineRewardReconciliationResult = {
  awardsCreated: number;
  reversalsCreated: number;
};

export function getRoutineAwardEventKey(
  occurrenceId: string,
  completionSequence: number
): string {
  return `${AWARD_PREFIX}${occurrenceId}:completion:${completionSequence}`;
}

export function getRoutineReversalEventKey(
  occurrenceId: string,
  completionSequence: number
): string {
  return `${getRoutineAwardEventKey(
    occurrenceId,
    completionSequence
  )}:reversal`;
}

function isComplete(
  occurrence: RoutineOccurrence
): boolean {
  return occurrence.snapshot.steps.every(step =>
    Boolean(occurrence.completedSteps[step.id])
  );
}

function getAutomaticAwards(
  transactions: RewardTransaction[],
  occurrenceId: string
): RewardTransaction[] {
  return transactions.filter(transaction =>
    transaction.entryType === 'award' &&
    transaction.source.kind === 'routine-completion' &&
    transaction.source.occurrenceId === occurrenceId
  );
}

function isReversed(
  transactions: RewardTransaction[],
  transactionId: string
): boolean {
  return transactions.some(transaction =>
    transaction.relation?.kind === 'reversal-of' &&
    transaction.relation.transactionId === transactionId
  );
}

function getAwardSequence(
  transaction: RewardTransaction
): number | null {
  const match = transaction.source.eventKey.match(
    /:completion:(\d+)$/
  );
  if (!match) return null;
  const sequence = Number(match[1]);
  return Number.isSafeInteger(sequence) && sequence > 0
    ? sequence
    : null;
}

export async function reconcileRoutineRewards(
  routines: RoutineFileStore = routineStore,
  rewards: RewardFileStore = rewardStore,
  now = new Date()
): Promise<RoutineRewardReconciliationResult> {
  const routineData = await routines.read();
  let rewardData = await rewards.read();
  let awardsCreated = 0;
  let reversalsCreated = 0;

  for (const occurrence of routineData.occurrences) {
    const contract = occurrence.rewardContract;
    if (!contract) continue;

    const expectedEventKey = getRoutineAwardEventKey(
      occurrence.id,
      occurrence.completionSequence
    );
    const awards = getAutomaticAwards(
      rewardData.transactions,
      occurrence.id
    );
    const activeAwards = awards.filter(award =>
      !isReversed(rewardData.transactions, award.id)
    );
    const complete = isComplete(occurrence);

    for (const award of activeAwards) {
      if (
        complete &&
        award.source.eventKey === expectedEventKey
      ) {
        continue;
      }

      const sequence = getAwardSequence(award);
      if (sequence === null) {
        throw new Error(
          'Automatic Routine reward event identity is invalid.'
        );
      }

      const result = await rewards.reverseTransaction(
        randomUUID(),
        award.id,
        {
          eventKey: getRoutineReversalEventKey(
            occurrence.id,
            sequence
          ),
          reason: 'Routine completion reopened',
          actorProfileId: null,
          timeZone: occurrence.timeZone,
        },
        now
      );
      if (result.created) reversalsCreated += 1;
      rewardData = await rewards.read();
    }

    if (!complete || occurrence.completionSequence < 1) {
      continue;
    }

    const currentAward = getAutomaticAwards(
      rewardData.transactions,
      occurrence.id
    ).find(award =>
      award.source.eventKey === expectedEventKey
    );
    if (
      currentAward &&
      !isReversed(rewardData.transactions, currentAward.id)
    ) {
      continue;
    }

    const result = await rewards.appendAward(
      randomUUID(),
      {
        profileId: contract.recipientProfileId,
        amount: contract.amount,
        category: 'routine',
        reason: null,
        source: {
          kind: 'routine-completion',
          eventKey: expectedEventKey,
          routineId: occurrence.routineId,
          occurrenceId: occurrence.id,
          label: 'Routine completion',
        },
        actorProfileId: null,
        timeZone: occurrence.timeZone,
      },
      now
    );
    if (result.created) awardsCreated += 1;
    rewardData = await rewards.read();
  }

  return { awardsCreated, reversalsCreated };
}
