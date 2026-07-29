import {
  CalendarDays,
  ExternalLink,
  MapPin,
} from 'lucide-react';

import { useCalendar } from '../../../hooks/useCalendar';

import type {
  CalendarEvent,
} from '../../../services/calendarService';

import './Calendar.css';

type EventGroupProps = {
  title: string;
  events: CalendarEvent[];
  showWeekday?: boolean;
};

function formatTime(
  event: CalendarEvent
) {
  if (event.allDay) {
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
    new Date(event.start)
  );
}

function formatWeekday(
  event: CalendarEvent
) {
  return new Intl.DateTimeFormat(
    'en-GB',
    {
      weekday: 'short',
    }
  ).format(
    new Date(event.start)
  );
}

function EventGroup({
  title,
  events,
  showWeekday = false,
}: EventGroupProps) {
  if (events.length === 0) {
    return null;
  }

  return (
    <section className="calendar-card__group">
      <h3 className="calendar-card__group-title">
        {title}
      </h3>

      <div className="calendar-card__events">
        {events.map(event => (
          <article
            className="calendar-card__event"
            key={event.id}
          >
            <div className="calendar-card__time">
              {showWeekday && (
                <span className="calendar-card__weekday">
                  {formatWeekday(
                    event
                  )}
                </span>
              )}

              <span>
                {formatTime(event)}
              </span>
            </div>

            <div className="calendar-card__event-content">
              <span className="calendar-card__event-title">
                {event.title}
              </span>

              {event.location && (
                <span className="calendar-card__location">
                  <MapPin
                    size={13}
                    strokeWidth={2}
                    aria-hidden="true"
                  />

                  {event.location}
                </span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Calendar() {
  const {
    events,
    todayEvents,
    tomorrowEvents,
    thisWeekEvents,
    calendarUrl,
    loading,
    error,
    refresh,
  } = useCalendar();

  function openCalendar() {
    window.open(
      calendarUrl,
      '_blank',
      'noopener,noreferrer'
    );
  }

  return (
    <section className="calendar-card">
      <header className="calendar-card__header">
        <div className="calendar-card__heading">
          <CalendarDays
            size={21}
            strokeWidth={2}
            aria-hidden="true"
          />

          <h2>Calendar</h2>
        </div>

        <button
          type="button"
          className="calendar-card__view-all"
          onClick={openCalendar}
        >
          View All

          <ExternalLink
            size={14}
            strokeWidth={2}
            aria-hidden="true"
          />
        </button>
      </header>

      {loading ? (
        <div className="calendar-card__state">
          Loading calendar...
        </div>
      ) : error ? (
        <div className="calendar-card__state calendar-card__state--error">
          <span>
            Unable to load calendar
          </span>

          <button
            type="button"
            onClick={() => {
              void refresh();
            }}
          >
            Retry
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="calendar-card__state">
          No upcoming events.
        </div>
      ) : (
        <div className="calendar-card__agenda">
          <EventGroup
            title="Today"
            events={todayEvents}
          />

          <EventGroup
            title="Tomorrow"
            events={tomorrowEvents}
          />

          <EventGroup
            title="This Week"
            events={thisWeekEvents}
            showWeekday
          />
        </div>
      )}
    </section>
  );
}

export default Calendar;
