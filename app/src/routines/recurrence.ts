import type {
  IsoWeekday,
  RoutineDefinition,
  RoutineOccurrence,
  RoutineTimeStatus,
} from '../types/routine';

export type ZonedDateInfo = {
  localDate: string;
  weekday: IsoWeekday;
  minutesSinceMidnight: number;
};

const WEEKDAY_BY_NAME: Record<
  string,
  IsoWeekday
> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

function getPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string {
  const value = parts.find(
    part => part.type === type
  )?.value;

  if (!value) {
    throw new Error(
      `Unable to determine local ${type}.`
    );
  }

  return value;
}

export function getZonedDateInfo(
  instant: Date,
  timeZone: string
): ZonedDateInfo {
  const parts = new Intl.DateTimeFormat(
    'en-GB',
    {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }
  ).formatToParts(instant);

  const year = getPart(parts, 'year');
  const month = getPart(parts, 'month');
  const day = getPart(parts, 'day');
  const weekdayName =
    getPart(parts, 'weekday');
  const weekday =
    WEEKDAY_BY_NAME[weekdayName];

  if (!weekday) {
    throw new Error(
      'Unable to determine local weekday.'
    );
  }

  return {
    localDate: `${year}-${month}-${day}`,
    weekday,
    minutesSinceMidnight:
      Number(getPart(parts, 'hour')) * 60 +
      Number(getPart(parts, 'minute')),
  };
}

export function timeToMinutes(
  time: string
): number {
  const [hours, minutes] =
    time.split(':').map(Number);

  return hours * 60 + minutes;
}

export function isRoutineScheduledToday(
  routine: RoutineDefinition,
  dateInfo: ZonedDateInfo,
  occurrence?: RoutineOccurrence
): boolean {
  const schedule =
    occurrence?.snapshot.schedule ??
    routine.schedule;

  return (
    routine.active &&
    schedule.daysOfWeek.includes(
      dateInfo.weekday
    )
  );
}

export function getOccurrenceRoutine(
  routine: RoutineDefinition,
  occurrence: RoutineOccurrence | undefined
): RoutineDefinition {
  if (!occurrence) {
    return routine;
  }

  return {
    ...routine,
    title: occurrence.snapshot.title,
    ownerProfileId:
      occurrence.snapshot.ownerProfileId,
    schedule: occurrence.snapshot.schedule,
    steps: occurrence.snapshot.steps,
  };
}

export function getCompletedStepCount(
  routine: RoutineDefinition,
  occurrence: RoutineOccurrence | undefined
): number {
  const steps =
    occurrence?.snapshot.steps ??
    routine.steps;

  return steps.filter(step =>
    Boolean(occurrence?.completedSteps[step.id])
  ).length;
}

export function isRoutineComplete(
  routine: RoutineDefinition,
  occurrence: RoutineOccurrence | undefined
): boolean {
  const steps =
    occurrence?.snapshot.steps ??
    routine.steps;

  return (
    steps.length > 0 &&
    steps.every(step =>
      Boolean(
        occurrence?.completedSteps[step.id]
      )
    )
  );
}

export function getRoutineTimeStatus(
  routine: RoutineDefinition,
  occurrence: RoutineOccurrence | undefined,
  dateInfo: ZonedDateInfo
): RoutineTimeStatus {
  if (isRoutineComplete(routine, occurrence)) {
    return 'completed';
  }

  const { startTime, endTime } =
    occurrence?.snapshot.schedule ??
    routine.schedule;

  if (!startTime) {
    return 'today';
  }

  if (
    startTime &&
    dateInfo.minutesSinceMidnight <
      timeToMinutes(startTime)
  ) {
    return 'upcoming';
  }

  if (
    endTime &&
    dateInfo.minutesSinceMidnight >
      timeToMinutes(endTime)
  ) {
    return 'overdue';
  }

  return 'due';
}

export function getOccurrenceId(
  routineId: string,
  localDate: string
): string {
  return `${routineId}@${localDate}`;
}
