import type {
  CalendarSource,
} from '../../../calendar/calendarModel';

export function CalendarSourceIndicator({
  source,
}: {
  source: CalendarSource;
}) {
  if (
    source.kind === 'calendar' &&
    source.label === 'Calendar'
  ) {
    return null;
  }

  return (
    <span
      className="calendar-card__source"
      aria-label={`Source: ${source.label}`}
      title={source.label}
    >
      {source.label}
    </span>
  );
}
