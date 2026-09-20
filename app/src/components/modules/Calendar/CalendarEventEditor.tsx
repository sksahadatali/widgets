import { useMemo, useState } from 'react';

import {
  CalendarEditApiError,
  getCalendarEditContext,
  updateCalendarEvent,
  type CalendarEditContext,
  type CalendarEditInput,
} from '../../../services/calendarService';
import { householdLocalToRfc3339 } from '../../../calendar/calendarEditTime';

function localDateTime(value: string): string { return value.slice(0, 16); }

function currentOffset(value: string): string | undefined {
  const offset = /(Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1];
  return offset === 'Z' ? '+00:00' : offset;
}

export function CalendarEventEditor({ initialContext, onCancel, onSaved }: {
  initialContext: CalendarEditContext;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [context, setContext] = useState(initialContext);
  const [title, setTitle] = useState(initialContext.title);
  const [location, setLocation] = useState(initialContext.location);
  const [start, setStart] = useState(initialContext.timing.kind === 'date' ? initialContext.timing.startDate : localDateTime(initialContext.timing.start));
  const [end, setEnd] = useState(initialContext.timing.kind === 'date' ? initialContext.timing.endDateExclusive : localDateTime(initialContext.timing.end));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const originalOffsets = useMemo(() => context.timing.kind === 'dateTime'
    ? { start: currentOffset(context.timing.start), end: currentOffset(context.timing.end) }
    : {}, [context]);

  const loadLatest = async () => {
    setSaving(true);
    setError(null);
    try {
      const latest = await getCalendarEditContext(context.eventKey);
      setContext(latest);
      setTitle(latest.title);
      setLocation(latest.location);
      setStart(latest.timing.kind === 'date' ? latest.timing.startDate : localDateTime(latest.timing.start));
      setEnd(latest.timing.kind === 'date' ? latest.timing.endDateExclusive : localDateTime(latest.timing.end));
      setConflict(false);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Latest event could not be loaded.'); }
    finally { setSaving(false); }
  };

  const save = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    setError(null);
    setConflict(false);
    setSaving(true);
    try {
      const timing = context.timing.kind === 'date'
        ? { kind: 'date' as const, startDate: start, endDateExclusive: end }
        : { kind: 'dateTime' as const, start: householdLocalToRfc3339(start, context.timing.timeZone, originalOffsets.start), end: householdLocalToRfc3339(end, context.timing.timeZone, originalOffsets.end), timeZone: 'Europe/London' as const };
      const input: CalendarEditInput = { scope: context.scope, revision: context.revision, title, location, timing };
      await updateCalendarEvent(context.eventKey, input);
      await onSaved();
    } catch (saveError) {
      const isConflict = saveError instanceof CalendarEditApiError && saveError.status === 409;
      setConflict(isConflict);
      setError(isConflict ? 'This event changed after it was loaded.' : saveError instanceof Error ? saveError.message : 'Calendar event could not be updated.');
    } finally { setSaving(false); }
  };

  return (
    <form className="calendar-event-editor" onSubmit={save}>
      {context.recurring && <p className="calendar-event-editor__scope">This occurrence can be edited. Whole-series editing is not available yet.</p>}
      {error && <div className="calendar-event-editor__error" role="alert">{error}{conflict && <button type="button" disabled={saving} onClick={() => void loadLatest()}>Load latest</button>}</div>}
      <label>Title<input required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} disabled={saving} /></label>
      <label>Location<input maxLength={500} value={location} onChange={event => setLocation(event.target.value)} disabled={saving} /></label>
      <label>Start<input required type={context.timing.kind === 'date' ? 'date' : 'datetime-local'} value={start} onChange={event => setStart(event.target.value)} disabled={saving} /></label>
      <label>{context.timing.kind === 'date' ? 'End date (exclusive)' : 'End'}<input required type={context.timing.kind === 'date' ? 'date' : 'datetime-local'} value={end} onChange={event => setEnd(event.target.value)} disabled={saving} /></label>
      <div className="calendar-event-editor__actions">
        <button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
    </form>
  );
}
