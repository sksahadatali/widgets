import type {
  HouseholdProfile,
} from '../household/householdProfiles';
import type {
  RedemptionRequest,
  RewardCatalogueItem,
} from '../types/redemption';

export type RedemptionRequestStatus =
  | 'requested'
  | 'cancelled'
  | 'declined';

export function getRedemptionRequestStatus(
  request: RedemptionRequest
): RedemptionRequestStatus {
  return request.closure?.kind ?? 'requested';
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
