import { CalendarDays } from 'lucide-react';

import { useCalendar } from '../../../hooks/useCalendar';

import './StatusCard.css';

function CalendarCard() {
  const {
    calendar,
    loading,
    error,
  } = useCalendar();

  const hasEvent =
    calendar &&
    calendar.title !== 'No Events';

  return (
    <article className="status-card calendar-card">
      <div className="status-card__header">
        <span className="status-card__icon">
          <CalendarDays
            size={20}
            strokeWidth={2}
            aria-hidden="true"
          />
        </span>

        <span className="status-card__label">
          Calendar
        </span>
      </div>

      {loading && !calendar ? (
        <>
          <strong className="status-card__primary">
            --
          </strong>

          <span className="status-card__secondary">
            Loading...
          </span>
        </>
      ) : error && !calendar ? (
        <>
          <strong className="status-card__primary">
            Unavailable
          </strong>

          <span className="status-card__secondary">
            Calendar error
          </span>

          <span className="status-card__footer">
            Update failed
          </span>
        </>
      ) : calendar ? (
        <>
          <strong className="status-card__primary">
            {calendar.title}
          </strong>

          {hasEvent && calendar.time ? (
            <>
              <span className="status-card__secondary">
                {calendar.time}
              </span>

              {calendar.meta && (
                <span className="status-card__footer">
                  {calendar.meta}
                </span>
              )}
            </>
          ) : (
            calendar.meta && (
              <span className="status-card__secondary">
                {calendar.meta}
              </span>
            )
          )}
        </>
      ) : null}
    </article>
  );
}

export default CalendarCard;