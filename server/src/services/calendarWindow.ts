const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export class CalendarWindowRequestError extends Error {}

export type CalendarWindowRequest = {
  startDate?: string;
  days?: number;
};

export function isCalendarLocalDate(value: string): boolean {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return year >= 1000 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

export function shiftCalendarLocalDate(
  localDate: string,
  days: number,
): string {
  if (!isCalendarLocalDate(localDate) || !Number.isInteger(days)) {
    throw new CalendarWindowRequestError('Calendar window is invalid.');
  }

  const [year, month, day] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function getCalendarHouseholdToday(
  now: Date,
  timeZone: string,
): string {
  if (Number.isNaN(now.getTime())) {
    throw new CalendarWindowRequestError('Calendar window is invalid.');
  }

  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find(item => item.type === type)?.value;
    const year = part('year');
    const month = part('month');
    const day = part('day');

    if (!year || !month || !day) {
      throw new Error('Missing date part.');
    }

    return `${year}-${month}-${day}`;
  } catch {
    throw new CalendarWindowRequestError('Calendar window is invalid.');
  }
}

export function parseCalendarWindowRequest(
  query: Record<string, unknown>,
  now: Date,
  timeZone: string,
): CalendarWindowRequest {
  const keys = Object.keys(query);
  if (
    keys.some(key => key !== 'startDate' && key !== 'days') ||
    keys.length > 2
  ) {
    throw new CalendarWindowRequestError('Calendar window is invalid.');
  }

  const hasStartDate = Object.hasOwn(query, 'startDate');
  const hasDays = Object.hasOwn(query, 'days');
  if (!hasStartDate && !hasDays) return {};
  if (!hasStartDate) {
    throw new CalendarWindowRequestError('Calendar window is invalid.');
  }

  const startDate = query.startDate;
  if (typeof startDate !== 'string' || !isCalendarLocalDate(startDate)) {
    throw new CalendarWindowRequestError('Calendar window is invalid.');
  }

  if (startDate < getCalendarHouseholdToday(now, timeZone)) {
    throw new CalendarWindowRequestError(
      'Calendar history before Household Today is unavailable.',
    );
  }

  if (!hasDays) return { startDate };

  const daysValue = query.days;
  if (
    typeof daysValue !== 'string' ||
    !/^[1-9]\d*$/.test(daysValue)
  ) {
    throw new CalendarWindowRequestError('Calendar window is invalid.');
  }

  const days = Number(daysValue);
  if (!Number.isSafeInteger(days) || days > 42) {
    throw new CalendarWindowRequestError('Calendar window is invalid.');
  }

  return { startDate, days };
}
