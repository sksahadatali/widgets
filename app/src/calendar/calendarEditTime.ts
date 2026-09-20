function formattedLocal(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (name: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === name)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

function offsetText(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '-';
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

export function householdLocalToRfc3339(local: string, timeZone: string, preferredOffset?: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) throw new Error('Enter a valid date and time.');
  const marker = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), 0);
  const expected = `${local}:00`;
  const candidates: string[] = [];
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const instant = new Date(marker - offset * 60_000);
    if (formattedLocal(instant, timeZone) === expected) candidates.push(`${local}:00${offsetText(offset)}`);
  }
  if (candidates.length === 0) throw new Error('That local time does not exist because the clocks change.');
  if (preferredOffset) {
    const preferred = candidates.find(value => value.endsWith(preferredOffset));
    if (preferred) return preferred;
  }
  if (candidates.length > 1) throw new Error('That local time occurs twice. Keep the existing offset or choose an unambiguous time.');
  return candidates[0];
}
