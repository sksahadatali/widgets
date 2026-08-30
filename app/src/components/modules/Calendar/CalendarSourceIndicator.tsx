import type {
  CalendarSource,
} from '../../../calendar/calendarModel';

export function CalendarSourceIndicator({
  source,
}: {
  source: CalendarSource;
}) {
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
