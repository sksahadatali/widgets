export type MealCalendarState = {
  householdToday: string;
  selectedWindowStart: string;
};

const LOCAL_DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})$/;

function parseLocalDate(
  localDate: string
): [number, number, number] {
  const match = LOCAL_DATE_PATTERN.exec(localDate);

  if (!match) {
    throw new Error('Meal date must use YYYY-MM-DD.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  if (
    year < 1000 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('Meal date is not a real Gregorian date.');
  }

  return [year, month, day];
}

export function isValidLocalDate(
  localDate: unknown
): localDate is string {
  if (typeof localDate !== 'string') return false;

  try {
    parseLocalDate(localDate);
    return true;
  } catch {
    return false;
  }
}

export function shiftMealLocalDate(
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
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function getDatePart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string {
  const value = parts.find(
    part => part.type === type
  )?.value;

  if (!value) {
    throw new Error(
      `Unable to determine household ${type}.`
    );
  }

  return value;
}

export function getHouseholdToday(
  instant: Date,
  timeZone: string
): string {
  const parts = new Intl.DateTimeFormat(
    'en-GB',
    {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }
  ).formatToParts(instant);

  return [
    getDatePart(parts, 'year'),
    getDatePart(parts, 'month'),
    getDatePart(parts, 'day'),
  ].join('-');
}

export function createMealCalendarState(
  instant: Date,
  timeZone: string
): MealCalendarState {
  const householdToday =
    getHouseholdToday(instant, timeZone);

  return {
    householdToday,
    selectedWindowStart: householdToday,
  };
}

export function refreshMealHouseholdToday(
  state: MealCalendarState,
  instant: Date,
  timeZone: string
): MealCalendarState {
  const householdToday =
    getHouseholdToday(instant, timeZone);

  return {
    householdToday,
    selectedWindowStart:
      state.selectedWindowStart === state.householdToday
        ? householdToday
        : state.selectedWindowStart,
  };
}

export function selectCurrentMealWindow(
  state: MealCalendarState
): MealCalendarState {
  return {
    ...state,
    selectedWindowStart: state.householdToday,
  };
}

export function getMealWindowDates(
  windowStart: string
): string[] {
  if (!isValidLocalDate(windowStart)) {
    throw new Error(
      'Meal planning window must start on a valid local date.'
    );
  }

  return Array.from(
    { length: 7 },
    (_, index) =>
      shiftMealLocalDate(windowStart, index)
  );
}

export function formatMealLocalDate(
  localDate: string,
  options: Intl.DateTimeFormatOptions
): string {
  const [year, month, day] =
    parseLocalDate(localDate);

  return new Intl.DateTimeFormat(
    'en-GB',
    {
      ...options,
      timeZone: 'UTC',
    }
  ).format(new Date(Date.UTC(year, month - 1, day)));
}
