import { createHmac, randomUUID } from 'node:crypto';
import type { CalendarWindowRequest } from './calendarWindow.js';

export const CALENDAR_READ_AUDIENCE = 'eyos-calendar-read-v1';
export const CALENDAR_READ_SIGNATURE_DOMAIN = `${CALENDAR_READ_AUDIENCE}\n`;

/** Provider credentials never belong in browser config or request URLs. */
export function createCalendarReadEnvelope(request: CalendarWindowRequest): {
  payload: string;
  signature: string;
} {
  const secret = process.env.EYOS_CALENDAR_READ_HMAC_SECRET?.trim();
  if (!secret || secret.length < 32 || secret.length > 512 ||
      secret === process.env.EYOS_CALENDAR_WRITE_HMAC_SECRET?.trim()) {
    throw new Error('Calendar read authentication is not configured.');
  }
  const window = request.startDate === undefined
    ? {}
    : { startDate: request.startDate, ...(request.days === undefined ? {} : { days: request.days }) };
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    audience: CALENDAR_READ_AUDIENCE,
    operation: 'read-calendar',
    requestId: randomUUID(),
    issuedAt: new Date().toISOString(),
    window,
  }), 'utf8').toString('base64url');
  return {
    payload,
    signature: createHmac('sha256', secret)
      .update(CALENDAR_READ_SIGNATURE_DOMAIN + payload, 'utf8')
      .digest('base64url'),
  };
}
