import type {
  HouseholdProfile,
  MemberHouseholdProfile,
} from '../household/householdProfiles';
import type {
  ManualAwardInput,
  ManualRewardCategory,
  RewardTransaction,
} from '../types/reward';

export const MANUAL_REWARD_CATEGORIES: Array<{
  value: ManualRewardCategory;
  label: string;
}> = [
  { value: 'school', label: 'School' },
  { value: 'kumon', label: 'Kumon' },
  { value: 'behaviour', label: 'Behaviour' },
  { value: 'helping', label: 'Helping' },
  { value: 'achievement', label: 'Achievement' },
  { value: 'other', label: 'Other' },
];

const MANUAL_CATEGORY_VALUES = new Set(
  MANUAL_REWARD_CATEGORIES.map(category => category.value)
);

export function getEligibleRewardRecipients(
  profiles: HouseholdProfile[]
): MemberHouseholdProfile[] {
  return profiles.filter(
    (profile): profile is MemberHouseholdProfile =>
      profile.kind === 'member' &&
      profile.memberType === 'child'
  );
}

export function canManageRewards(
  profile: HouseholdProfile
): boolean {
  return profile.kind === 'member' &&
    profile.memberType === 'adult';
}

export function selectVisibleRewardHistory({
  transactions,
  profiles,
  selectedProfile,
}: {
  transactions: RewardTransaction[];
  profiles: HouseholdProfile[];
  selectedProfile: HouseholdProfile;
}): RewardTransaction[] {
  const currentChildIds = new Set(
    getEligibleRewardRecipients(profiles).map(
      profile => profile.id
    )
  );

  return transactions
    .filter(transaction => {
      if (selectedProfile.kind === 'family') {
        return currentChildIds.has(
          transaction.profileId
        );
      }

      if (selectedProfile.memberType === 'child') {
        return transaction.profileId ===
          selectedProfile.id;
      }

      return true;
    })
    .sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    );
}

export function selectRewardBalanceProfiles(
  profiles: HouseholdProfile[],
  selectedProfile: HouseholdProfile
): MemberHouseholdProfile[] {
  const children = getEligibleRewardRecipients(profiles);

  if (
    selectedProfile.kind === 'member' &&
    selectedProfile.memberType === 'child'
  ) {
    return children.filter(
      profile => profile.id === selectedProfile.id
    );
  }

  return children;
}

export function getReversedRewardIds(
  transactions: RewardTransaction[]
): Set<string> {
  return new Set(
    transactions
      .filter(
        transaction =>
          transaction.entryType === 'reversal' &&
          transaction.relation?.kind === 'reversal-of'
      )
      .map(
        transaction =>
          transaction.relation!.transactionId
      )
  );
}

export function createManualAwardEventKey(
  requestId: string
): string {
  return `manual-award:${requestId}`;
}

export function createManualReversalEventKey(
  requestId: string
): string {
  return `manual-reversal:${requestId}`;
}

export function validateManualAward(
  input: ManualAwardInput
): ManualAwardInput {
  const reason = input.reason.trim();

  if (!input.profileId.trim()) {
    throw new Error('Choose a child recipient.');
  }

  if (
    !Number.isInteger(input.amount) ||
    input.amount < 1 ||
    input.amount > 100
  ) {
    throw new Error(
      'Stars must be a whole number from 1 to 100.'
    );
  }

  if (!MANUAL_CATEGORY_VALUES.has(input.category)) {
    throw new Error('Choose a Reward category.');
  }

  if (!reason) {
    throw new Error('Add a reason for this award.');
  }

  if (reason.length > 160) {
    throw new Error(
      'Reason must be 160 characters or fewer.'
    );
  }

  if (!input.actorProfileId.trim()) {
    throw new Error(
      'Select an adult profile to give stars.'
    );
  }

  if (!input.requestId.trim()) {
    throw new Error('Reward request ID is invalid.');
  }

  return {
    ...input,
    profileId: input.profileId.trim(),
    reason,
    actorProfileId: input.actorProfileId.trim(),
    requestId: input.requestId.trim(),
  };
}
