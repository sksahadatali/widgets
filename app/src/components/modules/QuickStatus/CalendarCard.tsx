import { CalendarDays } from 'lucide-react';

import { useCalendar } from '../../../hooks/useCalendar';

import './StatusCard.css';

function CalendarCard() {
  const {
    events,
    loading,
    error,
  } = useCalendar();

  const nextEvent =
    events.length > 0
      ? events[0]
      : null;

  function formatTime() {
    if (!nextEvent) {
      return '';
    }

    if (nextEvent.allDay) {
      return 'All day';
    }

    return new Intl.DateTimeFormat(
      'en-GB',
      {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }
    ).format(
      new Date(nextEvent.start)
    );
  }

  function formatDate() {
    if (!nextEvent) {
      return '';
    }

    return new Intl.DateTimeFormat(
      'en-GB',
      {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }
    ).format(
      new Date(nextEvent.start)
    );
  }

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
          Upcoming Event
        </span>
      </div>

      {loading ? (
        <>
          <strong className="status-card__primary">
            --
          </strong>

          <span className="status-card__secondary">
            Loading...
          </span>
        </>
      ) : error ? (
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
      ) : nextEvent ? (
        <>
          <strong className="status-card__primary">
            {nextEvent.title}
          </strong>

          <span className="status-card__secondary">
            {formatTime()}
          </span>

          <span className="status-card__footer">
            {formatDate()}
          </span>
        </>
      ) : (
        <>
          <strong className="status-card__primary">
            No Events
          </strong>

          <span className="status-card__secondary">
            Next 7 days clear
          </span>
        </>
      )}
    </article>
  );
}

export default CalendarCard;