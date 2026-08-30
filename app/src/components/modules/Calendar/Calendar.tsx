import {
  CalendarDays,
  ExternalLink,
  MapPin,
} from 'lucide-react';

import { useCalendar } from '../../../hooks/useCalendar';

import {
  formatCalendarLocalDate,
} from '../../../calendar/calendarModel';

import type {
  CalendarEvent,
} from '../../../services/calendarService';

import {
  CalendarSourceIndicator,
} from './CalendarSourceIndicator';

import './Calendar.css';

type EventGroupProps = {
  title: string;
  events: CalendarEvent[];
  timeZone: string;
  showDate?: boolean;
};

function formatTime(
  event: CalendarEvent,
  timeZone: string
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
      timeZone,
    }
  ).format(
    new Date(event.start)
  );
}

function formatDate(
  event: CalendarEvent
) {
  return formatCalendarLocalDate(
    event.startLocalDate,
    {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }
  );
}

export function CalendarEventRow({
  event,
  timeZone,
  showDate = false,
}: {
  event: CalendarEvent;
  timeZone: string;
  showDate?: boolean;
}) {
  return (
    <article className="calendar-card__event">
      <div className="calendar-card__time">
        {showDate && (
          <span className="calendar-card__date">
            {formatDate(event)}
          </span>
        )}

        <span>
          {formatTime(event, timeZone)}
        </span>
      </div>

      <div className="calendar-card__event-content">
        <div className="calendar-card__event-heading">
          <span className="calendar-card__event-title">
            {event.title}
          </span>

          <CalendarSourceIndicator source={event.source} />
        </div>

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
  );
}

function EventGroup({
  title,
  events,
  timeZone,
  showDate = false,
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
          <CalendarEventRow
            key={event.id}
            event={event}
            timeZone={timeZone}
            showDate={showDate}
          />
        ))}
      </div>
    </section>
  );
}

function Calendar() {
  const {
    todayEvents,
    tomorrowEvents,
    comingUpEvents,
    calendarUrl,
    timeZone,
    loading,
    error,
    refresh,
  } = useCalendar();
  const displayedEventCount =
    todayEvents.length +
    tomorrowEvents.length +
    comingUpEvents.length;

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
      ) : displayedEventCount === 0 ? (
        <div className="calendar-card__state">
          No upcoming events.
        </div>
      ) : (
        <div className="calendar-card__agenda">
          <EventGroup
            title="Today"
            events={todayEvents}
            timeZone={timeZone}
          />

          <EventGroup
            title="Tomorrow"
            events={tomorrowEvents}
            timeZone={timeZone}
          />

          <EventGroup
            title="Coming Up"
            events={comingUpEvents}
            timeZone={timeZone}
            showDate
          />
        </div>
      )}
    </section>
  );
}

export default Calendar;
