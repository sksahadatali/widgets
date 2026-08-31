import { CalendarDays } from 'lucide-react';

import { useCalendar } from '../../../hooks/useCalendar';

import {
  formatCalendarLocalDate,
  getCalendarHouseholdDate,
} from '../../../calendar/calendarModel';

import './StatusCard.css';

function CalendarCard() {
  const {
    events,
    timeZone,
    loading,
    error,
  } = useCalendar();

  const now = new Date();
  const today = getCalendarHouseholdDate(
    now,
    timeZone
  );

  const nextEvent =
    events
      .filter(event => {
        if (event.allDay) {
          return event.endLocalDateExclusive > today;
        }
  
        return new Date(event.start) > now;
      })
      .sort(
        (a, b) => {
          const dateOrder =
            a.startLocalDate.localeCompare(
              b.startLocalDate
            );

          if (dateOrder !== 0) return dateOrder;

          if (a.allDay !== b.allDay) {
            return a.allDay ? -1 : 1;
          }

          return new Date(a.start).getTime() -
            new Date(b.start).getTime();
        }
      )[0] ?? null;

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
        timeZone,
      }
    ).format(
      new Date(nextEvent.start)
    );
  }

  function formatDate() {
    if (!nextEvent) {
      return '';
    }

    return formatCalendarLocalDate(
      nextEvent.startLocalDate,
      {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }
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
            Outlook clear
          </span>
        </>
      )}
    </article>
  );
}

export default CalendarCard;
