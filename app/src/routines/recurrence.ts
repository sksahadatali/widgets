import type {
  IsoWeekday,
  RoutineDefinition,
  RoutineOccurrence,
  RoutineWindowState,
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
  dateInfo: ZonedDateInfo
): boolean {
  return (
    routine.active &&
    routine.schedule.daysOfWeek.includes(
      dateInfo.weekday
    )
  );
}

export function isRoutineComplete(
  routine: RoutineDefinition,
  occurrence: RoutineOccurrence | undefined
): boolean {
  return (
    routine.steps.length > 0 &&
    routine.steps.every(step =>
      Boolean(
        occurrence?.completedSteps[step.id]
      )
    )
  );
}

export function getRoutineWindowState(
  routine: RoutineDefinition,
  occurrence: RoutineOccurrence | undefined,
  dateInfo: ZonedDateInfo
): RoutineWindowState {
  if (isRoutineComplete(routine, occurrence)) {
    return 'complete';
  }

  const { startTime, endTime } =
    routine.schedule;

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

  return 'current';
}

export function getOccurrenceId(
  routineId: string,
  localDate: string
): string {
  return `${routineId}@${localDate}`;
}
