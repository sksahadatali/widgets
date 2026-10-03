import { afterEach, beforeEach } from 'node:test';

export const SYNTHETIC_READ_SECRET = 'synthetic-read-only-test-key-0000000000000000';

export function installCalendarReadTestSecret(): void {
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env.EYOS_CALENDAR_READ_HMAC_SECRET;
    process.env.EYOS_CALENDAR_READ_HMAC_SECRET = SYNTHETIC_READ_SECRET;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.EYOS_CALENDAR_READ_HMAC_SECRET;
    else process.env.EYOS_CALENDAR_READ_HMAC_SECRET = previous;
  });
}
