import type {
  HouseholdProfile,
  MemberHouseholdProfile,
} from '../household/householdProfiles';
import type {
  KumonAssignment,
} from '../types/kumon';

export function getKumonChildren(
  profiles: HouseholdProfile[]
): MemberHouseholdProfile[] {
  return profiles.filter(
    (profile): profile is MemberHouseholdProfile =>
      profile.kind === 'member' && profile.memberType === 'child'
  );
}

export function canManageKumon(profile: HouseholdProfile): boolean {
  return profile.kind === 'member' && profile.memberType === 'adult';
}

export function canUpdateKumonProgress(
  profile: HouseholdProfile,
  assignment: KumonAssignment
): boolean {
  return profile.kind === 'member' &&
    (profile.memberType === 'adult' || profile.id === assignment.childProfileId);
}

export function selectVisibleKumonAssignments({
  assignments,
  profiles,
  selectedProfile,
}: {
  assignments: KumonAssignment[];
  profiles: HouseholdProfile[];
  selectedProfile: HouseholdProfile;
}): KumonAssignment[] {
  const childIds = new Set(getKumonChildren(profiles).map(profile => profile.id));
  return assignments
    .filter(assignment => childIds.has(assignment.childProfileId))
    .filter(assignment =>
      selectedProfile.kind === 'family' ||
      selectedProfile.memberType === 'adult' ||
      assignment.childProfileId === selectedProfile.id
    );
}

export function isKumonAssignmentComplete(assignment: KumonAssignment): boolean {
  return assignment.completedUnits === assignment.totalUnits;
}

export function isChildKumonComplete(assignments: KumonAssignment[]): boolean {
  return assignments.length > 0 && assignments.every(isKumonAssignmentComplete);
}
