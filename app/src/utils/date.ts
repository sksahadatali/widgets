// src/utils/date.ts

/**
 * Returns a greeting based on the current hour.
 */
export function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours();

  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';

  return 'Good evening';
}

/**
 * Returns the current date.
 * Example: Sunday, 19 July
 */
export function getCurrentDate(date: Date = new Date()): string {
  const weekday = date.toLocaleDateString('en-GB', {
    weekday: 'long',
  });

  const dayMonth = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
  });

  return `${weekday}, ${dayMonth}`;
}

/**
 * Returns the current time.
 * Example: 06:29
 */
export function getCurrentTime(date: Date = new Date()): string {
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}