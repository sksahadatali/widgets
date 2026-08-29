import { randomUUID } from 'node:crypto';

import type {
  RedemptionRequest,
  RedemptionStoreData,
} from '../types/redemption.js';
import type {
  RewardStoreData,
  RewardTransaction,
} from '../types/reward.js';
import {
  RedemptionConflictError,
  RedemptionNotFoundError,
  type RequestMutationResult,
  redemptionStore,
} from './redemptionStore.js';
import {
  type RewardMutationResult,
  rewardStore,
} from './rewardStore.js';

const REDEMPTION_LABEL = 'Reward redemption';
const REFUND_REASON = 'Redemption cancelled and refunded';

export type RedemptionAccountingStatus =
  | 'requested'
  | 'cancelled'
  | 'declined'
  | 'approved'
  | 'refunded';

export type RedemptionAccountingResult = {
  request: RedemptionRequest;
  status: 'approved' | 'refunded';
  transaction: RewardTransaction;
  created: boolean;
};

type RedemptionStorePort = {
  read: () => Promise<RedemptionStoreData>;
  cancelRequest: (
    requestId: string,
    actorProfileId: unknown,
    now?: Date
  ) => Promise<RequestMutationResult>;
  declineRequest: (
    requestId: string,
    actorProfileId: unknown,
    now?: Date
  ) => Promise<RequestMutationResult>;
};

type RewardStorePort = {
  read: () => Promise<RewardStoreData>;
  appendRedemption: (
    id: string,
    input: unknown,
    now?: Date
  ) => Promise<RewardMutationResult>;
  reverseTransaction: (
    id: string,
    targetId: string,
    input: unknown,
    now?: Date
  ) => Promise<RewardMutationResult>;
};

type AccountingInspection = {
  status: RedemptionAccountingStatus;
  debit: RewardTransaction | null;
  refund: RewardTransaction | null;
};

export class RedemptionAccountingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedemptionAccountingError';
  }
}

export class RedemptionAccountingIntegrityError extends
  RedemptionAccountingError {
  constructor(message: string) {
    super(message);
    this.name = 'RedemptionAccountingIntegrityError';
  }
}

export function getRedemptionDebitEventKey(
  requestId: string
): string {
  return `redemption:${requestId}:debit`;
}

export function getRedemptionRefundEventKey(
  requestId: string
): string {
  return `redemption:${requestId}:refund`;
}

function assertActor(actorProfileId: unknown): string {
  if (
    typeof actorProfileId !== 'string' ||
    !actorProfileId.trim() ||
    actorProfileId.trim() === 'family'
  ) {
    throw new RedemptionAccountingError(
      'Select an adult profile to manage this Redemption request.'
    );
  }
  return actorProfileId.trim();
}

function assertDebitMatches(
  request: RedemptionRequest,
  debit: RewardTransaction
): void {
  if (
    debit.entryType !== 'redemption' ||
    debit.profileId !== request.profileId ||
    debit.currency !== request.contract.currency ||
    debit.amount !== -request.contract.starCost ||
    debit.category !== 'redemption' ||
    debit.reason !== null ||
    debit.source.kind !== 'redemption' ||
    debit.source.eventKey !==
      getRedemptionDebitEventKey(request.id) ||
    debit.source.label !== REDEMPTION_LABEL ||
    debit.relation !== null ||
    debit.timeZone !== request.timeZone
  ) {
    throw new RedemptionAccountingIntegrityError(
      'Redemption accounting does not match the captured request contract.'
    );
  }
}

function assertRefundMatches(
  request: RedemptionRequest,
  debit: RewardTransaction,
  refund: RewardTransaction
): void {
  if (
    refund.entryType !== 'reversal' ||
    refund.profileId !== debit.profileId ||
    refund.currency !== debit.currency ||
    refund.amount !== -debit.amount ||
    refund.category !== 'correction' ||
    refund.reason !== REFUND_REASON ||
    refund.source.kind !== 'correction' ||
    refund.source.eventKey !==
      getRedemptionRefundEventKey(request.id) ||
    refund.source.label !== 'Reward reversal' ||
    refund.relation?.kind !== 'reversal-of' ||
    refund.relation.transactionId !== debit.id ||
    refund.timeZone !== request.timeZone
  ) {
    throw new RedemptionAccountingIntegrityError(
      'Redemption refund accounting is inconsistent.'
    );
  }
}

export function inspectRedemptionAccounting(
  request: RedemptionRequest,
  transactions: RewardTransaction[]
): AccountingInspection {
  const debitKey = getRedemptionDebitEventKey(
    request.id
  );
  const refundKey = getRedemptionRefundEventKey(
    request.id
  );
  const debit = transactions.find(
    transaction =>
      transaction.source.eventKey === debitKey
  ) ?? null;
  const refundEvent = transactions.find(
    transaction =>
      transaction.source.eventKey === refundKey
  ) ?? null;

  if (!debit) {
    if (refundEvent) {
      throw new RedemptionAccountingIntegrityError(
        'Redemption refund exists without its debit.'
      );
    }
    return {
      status: request.closure?.kind ?? 'requested',
      debit: null,
      refund: null,
    };
  }

  assertDebitMatches(request, debit);
  if (request.closure) {
    throw new RedemptionAccountingIntegrityError(
      'A closed Redemption request also has a debit.'
    );
  }

  const reversals = transactions.filter(
    transaction =>
      transaction.relation?.kind === 'reversal-of' &&
      transaction.relation.transactionId === debit.id
  );

  if (!refundEvent) {
    if (reversals.length > 0) {
      throw new RedemptionAccountingIntegrityError(
        'Redemption debit has a non-canonical reversal.'
      );
    }
    return {
      status: 'approved',
      debit,
      refund: null,
    };
  }

  assertRefundMatches(request, debit, refundEvent);
  if (
    reversals.length !== 1 ||
    reversals[0].id !== refundEvent.id
  ) {
    throw new RedemptionAccountingIntegrityError(
      'Redemption refund relationship is inconsistent.'
    );
  }

  return {
    status: 'refunded',
    debit,
    refund: refundEvent,
  };
}

export class RedemptionAccountingService {
  private lifecycleQueue: Promise<void> =
    Promise.resolve();

  constructor(
    private readonly redemptions: RedemptionStorePort =
      redemptionStore,
    private readonly rewards: RewardStorePort = rewardStore,
    private readonly createTransactionId: () => string =
      randomUUID
  ) {}

  private async run<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    let result: T | undefined;
    let operationError: unknown;

    this.lifecycleQueue = this.lifecycleQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          result = await operation();
        } catch (error) {
          operationError = error;
        }
      });

    await this.lifecycleQueue;
    if (operationError) throw operationError;
    return result as T;
  }

  private async readRequest(
    requestId: string
  ): Promise<RedemptionRequest> {
    const store = await this.redemptions.read();
    const request = store.requests.find(
      candidate => candidate.id === requestId
    );
    if (!request) {
      throw new RedemptionNotFoundError(
        'Redemption request was not found.'
      );
    }
    return request;
  }

  approve(
    requestId: string,
    actorProfileId: unknown,
    now = new Date()
  ): Promise<RedemptionAccountingResult> {
    return this.run(async () => {
      const actor = assertActor(actorProfileId);
      const request = await this.readRequest(requestId);
      if (request.closure) {
        throw new RedemptionConflictError(
          'A closed Redemption request cannot be approved.'
        );
      }

      const ledger = await this.rewards.read();
      const current = inspectRedemptionAccounting(
        request,
        ledger.transactions
      );
      if (current.debit) {
        return {
          request,
          status: current.status as 'approved' | 'refunded',
          transaction:
            current.refund ?? current.debit,
          created: false,
        };
      }

      const mutation =
        await this.rewards.appendRedemption(
          this.createTransactionId(),
          {
            profileId: request.profileId,
            starCost: request.contract.starCost,
            eventKey:
              getRedemptionDebitEventKey(request.id),
            actorProfileId: actor,
            timeZone: request.timeZone,
          },
          now
        );

      return {
        request,
        status: 'approved',
        ...mutation,
      };
    });
  }

  refund(
    requestId: string,
    actorProfileId: unknown,
    now = new Date()
  ): Promise<RedemptionAccountingResult> {
    return this.run(async () => {
      const actor = assertActor(actorProfileId);
      const request = await this.readRequest(requestId);
      if (request.closure) {
        throw new RedemptionConflictError(
          'A closed Redemption request cannot be refunded.'
        );
      }

      const ledger = await this.rewards.read();
      const current = inspectRedemptionAccounting(
        request,
        ledger.transactions
      );
      if (!current.debit) {
        throw new RedemptionConflictError(
          'Only an approved Redemption request can be refunded.'
        );
      }
      if (current.refund) {
        return {
          request,
          status: 'refunded',
          transaction: current.refund,
          created: false,
        };
      }

      const mutation =
        await this.rewards.reverseTransaction(
          this.createTransactionId(),
          current.debit.id,
          {
            eventKey:
              getRedemptionRefundEventKey(request.id),
            reason: REFUND_REASON,
            actorProfileId: actor,
            timeZone: request.timeZone,
          },
          now
        );

      return {
        request,
        status: 'refunded',
        ...mutation,
      };
    });
  }

  cancel(
    requestId: string,
    actorProfileId: unknown,
    now = new Date()
  ): Promise<RequestMutationResult> {
    return this.run(async () => {
      assertActor(actorProfileId);
      const request = await this.readRequest(requestId);
      const ledger = await this.rewards.read();
      const current = inspectRedemptionAccounting(
        request,
        ledger.transactions
      );
      if (current.debit) {
        throw new RedemptionConflictError(
          'An approved Redemption request cannot be cancelled without a refund.'
        );
      }
      return this.redemptions.cancelRequest(
        requestId,
        actorProfileId,
        now
      );
    });
  }

  decline(
    requestId: string,
    actorProfileId: unknown,
    now = new Date()
  ): Promise<RequestMutationResult> {
    return this.run(async () => {
      assertActor(actorProfileId);
      const request = await this.readRequest(requestId);
      const ledger = await this.rewards.read();
      const current = inspectRedemptionAccounting(
        request,
        ledger.transactions
      );
      if (current.debit) {
        throw new RedemptionConflictError(
          'An approved Redemption request cannot be declined.'
        );
      }
      return this.redemptions.declineRequest(
        requestId,
        actorProfileId,
        now
      );
    });
  }
}

export const redemptionAccountingService =
  new RedemptionAccountingService();
