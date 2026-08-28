import {
  FAMILY_PROFILE_ID,
  type HouseholdProfile,
} from '../household/householdProfiles';
import type {
  RoutineOccurrence,
  RoutineOccurrenceSnapshot,
} from '../types/routine';

export type RoutineHistoryOutcome =
  | 'completed'
  | 'partial'
  | 'missed';

export type RoutineHistoryOutcomeFilter =
  | 'all'
  | RoutineHistoryOutcome;

export type RoutineHistoryRange = {
  startDate: string | null;
  endDate: string;
};

export type RoutineHistoryItem = {
  occurrenceId: string;
  routineId: string;
  localDate: string;
  timeZone: string;
  title: string;
  ownerProfileId: string;
  schedule: RoutineOccurrenceSnapshot['schedule'];
  steps: RoutineOccurrenceSnapshot['steps'];
  snapshotSource:
    RoutineOccurrenceSnapshot['source'];
  completedSteps: Record<string, string>;
  completedAt: string | null;
  completedStepCount: number;
  totalStepCount: number;
  outcome: RoutineHistoryOutcome;
};

export type RoutineHistoryMetrics = {
  recorded: number;
  completed: number;
  partial: number;
  missed: number;
  recordedCompletionRate: number | null;
};

export type RoutineHistoryLoadResult =
  | {
    occurrences: RoutineOccurrence[];
    error: null;
  }
  | {
    occurrences: [];
    error: string;
  };

type SelectVisibleHistoryOccurrencesInput = {
  occurrences: RoutineOccurrence[];
  profiles: HouseholdProfile[];
  selectedProfileId: string;
};

type SelectRoutineHistoryInput =
  SelectVisibleHistoryOccurrencesInput & {
    householdToday: string;
    range: RoutineHistoryRange;
    routineId?: string | null;
    outcome?: RoutineHistoryOutcomeFilter;
  };

const LOCAL_DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})$/;

function parseLocalDate(
  localDate: string
): [number, number, number] {
  const match =
    LOCAL_DATE_PATTERN.exec(localDate);

  if (!match) {
    throw new Error(
      'Routine history date is invalid.'
    );
  }

  return [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
}

export function shiftLocalDate(
  localDate: string,
  days: number
): string {
  const [year, month, day] =
    parseLocalDate(localDate);
  const date = new Date(
    Date.UTC(year, month - 1, day + days)
  );

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1)
      .padStart(2, '0'),
    String(date.getUTCDate())
      .padStart(2, '0'),
  ].join('-');
}

export function getRoutineHistoryRange(
  householdToday: string,
  days: 7 | 30 | null
): RoutineHistoryRange {
  return {
    startDate: days === null
      ? null
      : shiftLocalDate(
        householdToday,
        -days
      ),
    endDate: shiftLocalDate(
      householdToday,
      -1
    ),
  };
}

export function selectVisibleHistoryOccurrences({
  occurrences,
  profiles,
  selectedProfileId,
}: SelectVisibleHistoryOccurrencesInput): RoutineOccurrence[] {
  const configuredProfileIds = new Set(
    profiles.map(profile => profile.id)
  );
  const isFamilySelected =
    selectedProfileId === FAMILY_PROFILE_ID;

  return occurrences.filter(occurrence => {
    const ownerProfileId =
      occurrence.snapshot.ownerProfileId;

    if (
      !configuredProfileIds.has(ownerProfileId)
    ) {
      return false;
    }

    return (
      isFamilySelected ||
      ownerProfileId === FAMILY_PROFILE_ID ||
      ownerProfileId === selectedProfileId
    );
  });
}

export function getHistoryCompletedStepCount(
  occurrence: RoutineOccurrence
): number {
  return occurrence.snapshot.steps.filter(
    step => Boolean(
      occurrence.completedSteps[step.id]
    )
  ).length;
}

export function getRoutineHistoryOutcome(
  occurrence: RoutineOccurrence
): RoutineHistoryOutcome {
  const completedStepCount =
    getHistoryCompletedStepCount(occurrence);
  const totalStepCount =
    occurrence.snapshot.steps.length;

  if (
    totalStepCount > 0 &&
    completedStepCount === totalStepCount
  ) {
    return 'completed';
  }

  return completedStepCount > 0
    ? 'partial'
    : 'missed';
}

export function createRoutineHistoryItem(
  occurrence: RoutineOccurrence
): RoutineHistoryItem {
  const completedStepCount =
    getHistoryCompletedStepCount(occurrence);

  return {
    occurrenceId: occurrence.id,
    routineId: occurrence.routineId,
    localDate: occurrence.localDate,
    timeZone: occurrence.timeZone,
    title: occurrence.snapshot.title,
    ownerProfileId:
      occurrence.snapshot.ownerProfileId,
    schedule: occurrence.snapshot.schedule,
    steps: occurrence.snapshot.steps,
    snapshotSource:
      occurrence.snapshot.source,
    completedSteps: occurrence.completedSteps,
    completedAt: occurrence.completedAt,
    completedStepCount,
    totalStepCount:
      occurrence.snapshot.steps.length,
    outcome:
      getRoutineHistoryOutcome(occurrence),
  };
}

function isInRange(
  localDate: string,
  range: RoutineHistoryRange
): boolean {
  return (
    localDate <= range.endDate &&
    (
      range.startDate === null ||
      localDate >= range.startDate
    )
  );
}

export function selectRoutineHistory({
  occurrences,
  profiles,
  selectedProfileId,
  householdToday,
  range,
  routineId = null,
  outcome = 'all',
}: SelectRoutineHistoryInput): RoutineHistoryItem[] {
  return selectVisibleHistoryOccurrences({
    occurrences,
    profiles,
    selectedProfileId,
  })
    .filter(
      occurrence =>
        occurrence.localDate < householdToday &&
        isInRange(occurrence.localDate, range) &&
        (
          !routineId ||
          occurrence.routineId === routineId
        )
    )
    .map(createRoutineHistoryItem)
    .filter(
      item =>
        outcome === 'all' ||
        item.outcome === outcome
    )
    .sort((left, right) => {
      const dateComparison =
        right.localDate.localeCompare(
          left.localDate
        );

      if (dateComparison !== 0) {
        return dateComparison;
      }

      const leftStart =
        left.schedule.startTime ?? '99:99';
      const rightStart =
        right.schedule.startTime ?? '99:99';
      const timeComparison =
        leftStart.localeCompare(rightStart);

      if (timeComparison !== 0) {
        return timeComparison;
      }

      return left.occurrenceId.localeCompare(
        right.occurrenceId
      );
    });
}

export function getRoutineHistoryMetrics(
  items: RoutineHistoryItem[]
): RoutineHistoryMetrics {
  const completed = items.filter(
    item => item.outcome === 'completed'
  ).length;
  const partial = items.filter(
    item => item.outcome === 'partial'
  ).length;
  const missed = items.filter(
    item => item.outcome === 'missed'
  ).length;
  const recorded = items.length;

  return {
    recorded,
    completed,
    partial,
    missed,
    recordedCompletionRate:
      recorded === 0
        ? null
        : Math.round(
          completed / recorded * 100
        ),
  };
}

export async function resolveRoutineHistoryLoad(
  load: () => Promise<RoutineOccurrence[]>
): Promise<RoutineHistoryLoadResult> {
  try {
    return {
      occurrences: await load(),
      error: null,
    };
  } catch (error) {
    return {
      occurrences: [],
      error: error instanceof Error
        ? error.message
        : 'Unable to load routine history.',
    };
  }
}
