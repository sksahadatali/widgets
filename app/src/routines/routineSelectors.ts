import {
  FAMILY_PROFILE_ID,
  type HouseholdProfile,
} from '../household/householdProfiles';
import type {
  RoutineDefinition,
  RoutineOccurrence,
} from '../types/routine';
import {
  getOccurrenceRoutine,
  isRoutineScheduledToday,
  type ZonedDateInfo,
} from './recurrence';

type SelectVisibleTodayRoutinesInput = {
  routines: RoutineDefinition[];
  occurrenceByRoutineId: ReadonlyMap<
    string,
    RoutineOccurrence
  >;
  profiles: HouseholdProfile[];
  selectedProfileId: string;
  dateInfo: ZonedDateInfo;
};

export function selectVisibleTodayRoutines({
  routines,
  occurrenceByRoutineId,
  profiles,
  selectedProfileId,
  dateInfo,
}: SelectVisibleTodayRoutinesInput): RoutineDefinition[] {
  const configuredProfileIds = new Set(
    profiles.map(profile => profile.id)
  );
  const isFamilySelected =
    selectedProfileId === FAMILY_PROFILE_ID;

  return routines
    .map(routine => {
      const occurrence =
        occurrenceByRoutineId.get(routine.id);

      return getOccurrenceRoutine(
        routine,
        occurrence
      );
    })
    .filter(routine => {
      if (
        !configuredProfileIds.has(
          routine.ownerProfileId
        ) ||
        !isRoutineScheduledToday(
          routine,
          dateInfo,
          occurrenceByRoutineId.get(routine.id)
        )
      ) {
        return false;
      }

      return (
        isFamilySelected ||
        routine.ownerProfileId ===
          FAMILY_PROFILE_ID ||
        routine.ownerProfileId ===
          selectedProfileId
      );
    });
}
