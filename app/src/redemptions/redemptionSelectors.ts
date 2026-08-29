import type {
  HouseholdProfile,
} from '../household/householdProfiles';
import type {
  RedemptionRequest,
  RewardCatalogueItem,
} from '../types/redemption';
import type {
  RewardTransaction,
} from '../types/reward';

export type RedemptionRequestStatus =
  | 'requested'
  | 'cancelled'
  | 'declined'
  | 'approved'
  | 'refunded'
  | 'accounting-error';

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

function debitMatches(
  request: RedemptionRequest,
  debit: RewardTransaction
): boolean {
  return debit.entryType === 'redemption' &&
    debit.profileId === request.profileId &&
    debit.currency === request.contract.currency &&
    debit.amount === -request.contract.starCost &&
    debit.category === 'redemption' &&
    debit.reason === null &&
    debit.source.kind === 'redemption' &&
    debit.source.eventKey ===
      getRedemptionDebitEventKey(request.id) &&
    debit.source.label === 'Reward redemption' &&
    debit.relation === null &&
    debit.timeZone === request.timeZone;
}

function refundMatches(
  request: RedemptionRequest,
  debit: RewardTransaction,
  refund: RewardTransaction
): boolean {
  return refund.entryType === 'reversal' &&
    refund.profileId === debit.profileId &&
    refund.currency === debit.currency &&
    refund.amount === -debit.amount &&
    refund.category === 'correction' &&
    refund.reason ===
      'Redemption cancelled and refunded' &&
    refund.source.kind === 'correction' &&
    refund.source.eventKey ===
      getRedemptionRefundEventKey(request.id) &&
    refund.source.label === 'Reward reversal' &&
    refund.relation?.kind === 'reversal-of' &&
    refund.relation.transactionId === debit.id &&
    refund.timeZone === request.timeZone;
}

export function getRedemptionRequestStatus(
  request: RedemptionRequest,
  transactions: RewardTransaction[] = []
): RedemptionRequestStatus {
  const debit = transactions.find(transaction =>
    transaction.source.eventKey ===
      getRedemptionDebitEventKey(request.id)
  );
  const refundEvent = transactions.find(transaction =>
    transaction.source.eventKey ===
      getRedemptionRefundEventKey(request.id)
  );

  if (!debit) {
    if (refundEvent) return 'accounting-error';
    return request.closure?.kind ?? 'requested';
  }
  if (request.closure || !debitMatches(request, debit)) {
    return 'accounting-error';
  }

  const reversals = transactions.filter(transaction =>
    transaction.relation?.kind === 'reversal-of' &&
    transaction.relation.transactionId === debit.id
  );
  if (!refundEvent) {
    return reversals.length === 0
      ? 'approved'
      : 'accounting-error';
  }
  if (
    !refundMatches(request, debit, refundEvent) ||
    reversals.length !== 1 ||
    reversals[0].id !== refundEvent.id
  ) {
    return 'accounting-error';
  }
  return 'refunded';
}

export function selectActiveCatalogue(
  catalogue: RewardCatalogueItem[]
): RewardCatalogueItem[] {
  return catalogue.filter(item => item.active);
}

export function selectVisibleRedemptionRequests({
  requests,
  profiles,
  selectedProfile,
}: {
  requests: RedemptionRequest[];
  profiles: HouseholdProfile[];
  selectedProfile: HouseholdProfile;
}): RedemptionRequest[] {
  const currentChildIds = new Set(
    profiles.flatMap(profile =>
      profile.kind === 'member' &&
      profile.memberType === 'child'
        ? [profile.id]
        : []
    )
  );

  return requests
    .filter(request => {
      if (selectedProfile.kind === 'family') {
        return currentChildIds.has(request.profileId);
      }
      if (selectedProfile.memberType === 'child') {
        return request.profileId === selectedProfile.id;
      }
      return true;
    })
    .sort((left, right) =>
      right.requestedAt.localeCompare(left.requestedAt)
    );
}
