import type {
  HouseholdConfig,
  HouseholdMemberType,
} from '../services/householdConfigService';

export const FAMILY_PROFILE_ID =
  'family' as const;

export type FamilyHouseholdProfile = {
  id: typeof FAMILY_PROFILE_ID;
  kind: 'family';
  displayName: string;
};

export type MemberHouseholdProfile = {
  id: string;
  kind: 'member';
  displayName: string;
  memberType: HouseholdMemberType;
};

export type HouseholdProfile =
  | FamilyHouseholdProfile
  | MemberHouseholdProfile;

export function buildHouseholdProfiles(
  config: HouseholdConfig
): HouseholdProfile[] {
  return [
    {
      id: FAMILY_PROFILE_ID,
      kind: 'family',
      displayName:
        config.household.displayName,
    },
    ...config.household.members.map(
      member => ({
        id: member.id,
        kind: 'member' as const,
        displayName: member.displayName,
        memberType: member.memberType,
      })
    ),
  ];
}

export function getProfileInitials(
  displayName: string
): string {
  return displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
}
