import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { householdLocalToRfc3339 } from '../../app/src/calendar/calendarEditTime';

describe('Calendar event editing client', () => {
  it('creates explicit London offsets and rejects the spring gap and unresolved repeated hour', () => {
    assert.equal(householdLocalToRfc3339('2026-07-01T09:00', 'Europe/London'), '2026-07-01T09:00:00+01:00');
    assert.equal(householdLocalToRfc3339('2026-12-01T09:00', 'Europe/London'), '2026-12-01T09:00:00+00:00');
    assert.throws(() => householdLocalToRfc3339('2026-03-29T01:30', 'Europe/London'), /does not exist/);
    assert.equal(householdLocalToRfc3339('2026-10-25T01:30', 'Europe/London', '+00:00'), '2026-10-25T01:30:00+00:00');
    assert.throws(() => householdLocalToRfc3339('2026-10-25T01:30', 'Europe/London'), /occurs twice/);
  });

  it('keeps editing on the dedicated page, gates it by writable, and leaves Home read-only', async () => {
    const page = await readFile(new URL('../../app/src/pages/WeeklyCalendar.tsx', import.meta.url), 'utf8');
    const editor = await readFile(new URL('../../app/src/components/modules/Calendar/CalendarEventEditor.tsx', import.meta.url), 'utf8');
    const home = await readFile(new URL('../../app/src/components/modules/Calendar/Calendar.tsx', import.meta.url), 'utf8');
    assert.match(page, /allowEditing && event\.writable === true/);
    assert.match(page, /allowEditing=\{fresh\}/);
    assert.match(page, /event\.writable === true/);
    assert.match(page, /Edit event/);
    assert.match(editor, /This occurrence can be edited\. Whole-series editing is not available yet\./);
    assert.match(editor, /Saving…/);
    assert.match(editor, /Load latest/);
    assert.match(editor, /await updateCalendarEvent/);
    assert.match(editor, /invalidateCachedCalendarEvent/);
    assert.match(editor, /await onSaved/);
    assert.doesNotMatch(home, /CalendarEventEditor|Edit event|getCalendarEditContext/);
  });

  it('retains entered state on conflicts and provider failures instead of applying an optimistic event', async () => {
    const editor = await readFile(new URL('../../app/src/components/modules/Calendar/CalendarEventEditor.tsx', import.meta.url), 'utf8');
    assert.match(editor, /saveError instanceof CalendarEditApiError && saveError\.status === 409/);
    assert.doesNotMatch(editor, /setTitle\([^)]*save|setLocation\([^)]*save/);
    assert.match(editor, /setConflict\(isConflict\)/);
  });
});
