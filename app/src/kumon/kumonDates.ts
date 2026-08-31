import {
  getZonedDateInfo,
} from '../routines/recurrence';

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(localDate: string): [number, number, number] {
  const match = LOCAL_DATE_PATTERN.exec(localDate);
  if (!match) throw new Error('Kumon date must use YYYY-MM-DD.');
  const result: [number, number, number] = [
    Number(match[1]), Number(match[2]), Number(match[3]),
  ];
  const date = new Date(Date.UTC(result[0], result[1] - 1, result[2]));
  if (
    result[0] < 1000 || date.getUTCFullYear() !== result[0] ||
    date.getUTCMonth() !== result[1] - 1 || date.getUTCDate() !== result[2]
  ) throw new Error('Kumon date is not a real Gregorian date.');
  return result;
}

export function shiftKumonDate(localDate: string, days: number): string {
  if (!Number.isInteger(days)) throw new Error('Kumon date shift is invalid.');
  const [year, month, day] = parseDate(localDate);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function getKumonToday(instant: Date, timeZone: string): string {
  return getZonedDateInfo(instant, timeZone).localDate;
}

export function getRecentKumonDates(today: string): string[] {
  return Array.from({ length: 7 }, (_, index) => shiftKumonDate(today, -index));
}

export function formatKumonDate(localDate: string): string {
  const [year, month, day] = parseDate(localDate);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
