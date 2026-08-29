import exampleStore from '../data/rewards.example.json';
import type {
  RedemptionRequest,
} from '../types/redemption';
import type {
  ManualAwardInput,
  RewardReversalInput,
  RewardStoreData,
  RewardTransaction,
} from '../types/reward';
import type {
  RoutineData,
  RoutineOccurrence,
} from '../types/routine';
import {
  getRewardBalance,
} from './rewardSelectors';
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

  const reversed = new Set(
    transactions.flatMap(transaction =>
      transaction.relation?.kind === 'reversal-of'
        ? [transaction.relation.transactionId]
        : []
    )
  );
  const activeRoutineOccurrences = new Set<string>();
  for (const transaction of transactions) {
    if (
      transaction.entryType !== 'award' ||
      transaction.source.kind !== 'routine-completion' ||
      reversed.has(transaction.id)
    ) continue;
    if (activeRoutineOccurrences.has(transaction.source.occurrenceId)) {
      throw new Error(
        'Safe Demo reward data has duplicate active Routine awards.'
      );
    }
    activeRoutineOccurrences.add(transaction.source.occurrenceId);
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

function redemptionDebitKey(requestId: string): string {
  return `redemption:${requestId}:debit`;
}

function redemptionRefundKey(requestId: string): string {
  return `redemption:${requestId}:refund`;
}

function assertDemoActor(actorProfileId: string): void {
  if (!actorProfileId.trim() || actorProfileId === 'family') {
    throw new Error(
      'Select an adult profile to manage this Redemption request.'
    );
  }
}

function demoDebitMatches(
  request: RedemptionRequest,
  transaction: RewardTransaction
): boolean {
  return transaction.entryType === 'redemption' &&
    transaction.profileId === request.profileId &&
    transaction.currency === request.contract.currency &&
    transaction.amount === -request.contract.starCost &&
    transaction.category === 'redemption' &&
    transaction.reason === null &&
    transaction.source.kind === 'redemption' &&
    transaction.source.eventKey ===
      redemptionDebitKey(request.id) &&
    transaction.source.label === 'Reward redemption' &&
    transaction.relation === null &&
    transaction.timeZone === request.timeZone;
}

export function appendDemoRedemption(
  request: RedemptionRequest,
  actorProfileId: string,
  now = new Date()
): RewardTransaction {
  assertDemoActor(actorProfileId);
  const eventKey = redemptionDebitKey(request.id);
  const existing = demoStore.transactions.find(
    transaction => transaction.source.eventKey === eventKey
  );
  if (existing) {
    if (demoDebitMatches(request, existing)) {
      return structuredClone(existing);
    }
    throw new Error(
      'Redemption accounting does not match the captured request contract.'
    );
  }
  if (
    getRewardBalance(
      demoStore.transactions,
      request.profileId
    ) < request.contract.starCost
  ) {
    throw new Error(
      'There are not enough stars to approve this request.'
    );
  }

  const transaction: RewardTransaction = {
    id: crypto.randomUUID(),
    profileId: request.profileId,
    entryType: 'redemption',
    currency: request.contract.currency,
    amount: -request.contract.starCost,
    category: 'redemption',
    reason: null,
    source: {
      kind: 'redemption',
      eventKey,
      label: 'Reward redemption',
    },
    relation: null,
    actorProfileId,
    createdAt: now.toISOString(),
    localDate: getLocalDate(now, request.timeZone),
    timeZone: request.timeZone,
  };
  demoStore.transactions.push(transaction);
  validateDemoRewardStore(demoStore);
  return structuredClone(transaction);
}

export function refundDemoRedemption(
  request: RedemptionRequest,
  actorProfileId: string,
  now = new Date()
): RewardTransaction {
  assertDemoActor(actorProfileId);
  const debit = demoStore.transactions.find(
    transaction => transaction.source.eventKey ===
      redemptionDebitKey(request.id)
  );
  if (!debit || !demoDebitMatches(request, debit)) {
    throw new Error(
      debit
        ? 'Redemption accounting does not match the captured request contract.'
        : 'Only an approved Redemption request can be refunded.'
    );
  }

  const eventKey = redemptionRefundKey(request.id);
  const existing = demoStore.transactions.find(
    transaction => transaction.source.eventKey === eventKey
  );
  if (existing) {
    if (
      existing.entryType === 'reversal' &&
      existing.profileId === debit.profileId &&
      existing.currency === debit.currency &&
      existing.amount === -debit.amount &&
      existing.reason === 'Redemption cancelled and refunded' &&
      existing.relation?.kind === 'reversal-of' &&
      existing.relation.transactionId === debit.id
    ) {
      return structuredClone(existing);
    }
    throw new Error('Redemption refund accounting is inconsistent.');
  }
  if (demoStore.transactions.some(transaction =>
    transaction.relation?.kind === 'reversal-of' &&
    transaction.relation.transactionId === debit.id
  )) {
    throw new Error('Redemption debit has already been reversed.');
  }

  const refund: RewardTransaction = {
    id: crypto.randomUUID(),
    profileId: debit.profileId,
    entryType: 'reversal',
    currency: debit.currency,
    amount: -debit.amount,
    category: 'correction',
    reason: 'Redemption cancelled and refunded',
    source: {
      kind: 'correction',
      eventKey,
      label: 'Reward reversal',
    },
    relation: {
      kind: 'reversal-of',
      transactionId: debit.id,
    },
    actorProfileId,
    createdAt: now.toISOString(),
    localDate: getLocalDate(now, request.timeZone),
    timeZone: request.timeZone,
  };
  demoStore.transactions.push(refund);
  validateDemoRewardStore(demoStore);
  return structuredClone(refund);
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

function routineAwardKey(
  occurrence: RoutineOccurrence
): string {
  return `routine-occurrence:${occurrence.id}:completion:${occurrence.completionSequence}`;
}

function routineIsComplete(
  occurrence: RoutineOccurrence
): boolean {
  return occurrence.snapshot.steps.every(step =>
    Boolean(occurrence.completedSteps[step.id])
  );
}

export function reconcileDemoRoutineRewards(
  routines: RoutineData,
  now = new Date()
): void {
  for (const occurrence of routines.occurrences) {
    const contract = occurrence.rewardContract;
    if (!contract) continue;

    const expectedKey = routineAwardKey(occurrence);
    const awards = demoStore.transactions.filter(transaction =>
      transaction.entryType === 'award' &&
      transaction.source.kind === 'routine-completion' &&
      transaction.source.occurrenceId === occurrence.id
    );
    const active = awards.filter(award =>
      !demoStore.transactions.some(transaction =>
        transaction.relation?.kind === 'reversal-of' &&
        transaction.relation.transactionId === award.id
      )
    );
    const complete = routineIsComplete(occurrence);

    for (const award of active) {
      if (complete && award.source.eventKey === expectedKey) {
        continue;
      }
      const match = award.source.eventKey.match(
        /:completion:(\d+)$/
      );
      if (!match) throw new Error('Invalid Demo reward event.');
      const eventKey =
        `routine-occurrence:${occurrence.id}:completion:${match[1]}:reversal`;
      if (demoStore.transactions.some(transaction =>
        transaction.source.eventKey === eventKey
      )) continue;

      demoStore.transactions.push({
        id: crypto.randomUUID(),
        profileId: award.profileId,
        entryType: 'reversal',
        currency: 'star',
        amount: -award.amount,
        category: 'correction',
        reason: 'Routine completion reopened',
        source: {
          kind: 'correction',
          eventKey,
          label: 'Reward reversal',
        },
        relation: {
          kind: 'reversal-of',
          transactionId: award.id,
        },
        actorProfileId: null,
        createdAt: now.toISOString(),
        localDate: getLocalDate(now, occurrence.timeZone),
        timeZone: occurrence.timeZone,
      });
    }

    if (!complete || occurrence.completionSequence < 1) continue;
    const existing = demoStore.transactions.find(transaction =>
      transaction.source.eventKey === expectedKey
    );
    if (existing) continue;

    demoStore.transactions.push({
      id: crypto.randomUUID(),
      profileId: contract.recipientProfileId,
      entryType: 'award',
      currency: 'star',
      amount: contract.amount,
      category: 'routine',
      reason: null,
      source: {
        kind: 'routine-completion',
        eventKey: expectedKey,
        routineId: occurrence.routineId,
        occurrenceId: occurrence.id,
        label: 'Routine completion',
      },
      relation: null,
      actorProfileId: null,
      createdAt: now.toISOString(),
      localDate: getLocalDate(now, occurrence.timeZone),
      timeZone: occurrence.timeZone,
    });
  }

  validateDemoRewardStore(demoStore);
}

export function resetDemoRewardStore(): void {
  demoStore = structuredClone(
    validateDemoRewardStore(exampleStore)
  );
}
