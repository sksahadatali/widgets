import {
  FAMILY_PROFILE_ID,
  type HouseholdProfile,
} from '../household/householdProfiles';
import type {
  RoutineDefinition,
  RoutineOccurrence,
} from '../types/routine';
import {
  getCompletedStepCount,
  getOccurrenceRoutine,
  getRoutineTimeStatus,
  isRoutineScheduledToday,
  timeToMinutes,
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

export type RoutineAttentionCandidate = {
  routineId: string;
  occurrenceId: string;
  title: string;
  ownerProfileId: string;
  localDate: string;
  status:
    | 'today'
    | 'upcoming'
    | 'due'
    | 'overdue';
  displayStatus:
    | 'Today'
    | 'Upcoming'
    | 'Due'
    | 'In progress'
    | 'Overdue';
  startTime: string | null;
  endTime: string | null;
  minutesUntilStart: number | null;
  completedSteps: number;
  totalSteps: number;
};

type SelectRoutineAttentionCandidatesInput = {
  routines: RoutineDefinition[];
  occurrenceByRoutineId: ReadonlyMap<
    string,
    RoutineOccurrence
  >;
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

export function selectRoutineAttentionCandidates({
  routines,
  occurrenceByRoutineId,
  dateInfo,
}: SelectRoutineAttentionCandidatesInput): RoutineAttentionCandidate[] {
  return routines.flatMap(routine => {
    const occurrence =
      occurrenceByRoutineId.get(routine.id);

    if (
      !occurrence ||
      occurrence.localDate !== dateInfo.localDate ||
      !routine.active ||
      !isRoutineScheduledToday(
        routine,
        dateInfo,
        occurrence
      )
    ) {
      return [];
    }

    const status = getRoutineTimeStatus(
      routine,
      occurrence,
      dateInfo
    );

    if (status === 'completed') {
      return [];
    }

    const completedSteps =
      getCompletedStepCount(
        routine,
        occurrence
      );
    const { startTime, endTime } =
      occurrence.snapshot.schedule;
    const displayStatus =
      status === 'due' && completedSteps > 0
        ? 'In progress'
        : status === 'today'
          ? 'Today'
          : status === 'upcoming'
            ? 'Upcoming'
            : status === 'due'
              ? 'Due'
              : 'Overdue';

    return [{
      routineId: routine.id,
      occurrenceId: occurrence.id,
      title: occurrence.snapshot.title,
      ownerProfileId:
        occurrence.snapshot.ownerProfileId,
      localDate: occurrence.localDate,
      status,
      displayStatus,
      startTime,
      endTime,
      minutesUntilStart:
        status === 'upcoming' && startTime
          ? timeToMinutes(startTime) -
            dateInfo.minutesSinceMidnight
          : null,
      completedSteps,
      totalSteps:
        occurrence.snapshot.steps.length,
    }];
  });
}
