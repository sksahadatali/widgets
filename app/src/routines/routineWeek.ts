import {
  FAMILY_PROFILE_ID,
  type HouseholdProfile,
} from '../household/householdProfiles';
import type {
  IsoWeekday,
  RoutineDefinition,
  RoutineOccurrence,
} from '../types/routine';
import {
  getOccurrenceRoutine,
} from './recurrence';

const LOCAL_DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})$/;

function localDateAsUtc(
  localDate: string
): Date {
  const match = LOCAL_DATE_PATTERN.exec(localDate);

  if (!match) {
    throw new Error('Routine local date is invalid.');
  }

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day)
  ));

  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new Error('Routine local date is invalid.');
  }

  return date;
}

function utcAsLocalDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addRoutineDays(
  localDate: string,
  dayCount: number
): string {
  const date = localDateAsUtc(localDate);
  date.setUTCDate(date.getUTCDate() + dayCount);
  return utcAsLocalDate(date);
}

export function getRoutineWeekday(
  localDate: string
): IsoWeekday {
  const day = localDateAsUtc(localDate).getUTCDay();
  return (day === 0 ? 7 : day) as IsoWeekday;
}

export function getRoutineWeekStart(
  localDate: string
): string {
  return addRoutineDays(
    localDate,
    1 - getRoutineWeekday(localDate)
  );
}

export function getRoutineWeekDates(
  weekStart: string
): string[] {
  return Array.from(
    { length: 7 },
    (_, index) => addRoutineDays(weekStart, index)
  );
}

export type RoutineWeekEntry = {
  routine: RoutineDefinition;
  occurrence: RoutineOccurrence | undefined;
};

type SelectRoutineWeekEntriesInput = {
  routines: RoutineDefinition[];
  occurrences: RoutineOccurrence[];
  profiles: HouseholdProfile[];
  selectedProfileId: string;
  localDate: string;
  householdToday: string;
};

export function selectRoutineWeekEntries({
  routines,
  occurrences,
  profiles,
  selectedProfileId,
  localDate,
  householdToday,
}: SelectRoutineWeekEntriesInput): RoutineWeekEntry[] {
  const configuredProfileIds = new Set(
    profiles.map(profile => profile.id)
  );
  const occurrenceByRoutineId = new Map(
    occurrences
      .filter(occurrence =>
        occurrence.localDate === localDate
      )
      .map(occurrence => [
        occurrence.routineId,
        occurrence,
      ])
  );
  const weekday = getRoutineWeekday(localDate);
  const isPast = localDate < householdToday;
  const isFamilySelected =
    selectedProfileId === FAMILY_PROFILE_ID;

  return routines.flatMap(routine => {
    const occurrence =
      occurrenceByRoutineId.get(routine.id);

    if (isPast && !occurrence) {
      return [];
    }

    const displayedRoutine = getOccurrenceRoutine(
      routine,
      occurrence
    );
    const isScheduled =
      displayedRoutine.schedule.daysOfWeek.includes(
        weekday
      );

    if (
      !isScheduled ||
      (!isPast && !routine.active) ||
      !configuredProfileIds.has(
        displayedRoutine.ownerProfileId
      ) ||
      (
        !isFamilySelected &&
        displayedRoutine.ownerProfileId !==
          FAMILY_PROFILE_ID &&
        displayedRoutine.ownerProfileId !==
          selectedProfileId
      )
    ) {
      return [];
    }

    return [{
      routine: displayedRoutine,
      occurrence,
    }];
  });
}
