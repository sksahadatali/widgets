import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  formatCalendarLocalDate,
  type CalendarEvent,
} from '../calendar/calendarModel';
import {
  canNavigateCalendarWindowPrevious,
  createCalendarWindowState,
  formatCalendarWindowRange,
  navigateCalendarWindow,
  refreshCalendarWindowToday,
  resetCalendarWindowToToday,
  selectCalendarWindow,
} from '../calendar/calendarWeek';
import {
  CalendarPeoplePicker,
} from '../components/modules/Calendar/CalendarPeoplePicker';
import {
  CalendarSourceIndicator,
} from '../components/modules/Calendar/CalendarSourceIndicator';
import { useCalendar } from '../hooks/useCalendar';
import { getHouseholdConfig } from '../services/householdConfigService';

import '../components/modules/Calendar/Calendar.css';
import './WeeklyCalendar.css';

const ASSIGNABLE_EVENT_KEY =
  /^calendar-event-v1-[a-f0-9]{64}$/;

function formatEventTime(
  event: CalendarEvent,
  timeZone: string
): string {
  if (event.allDay) return 'All day';

  const formatter = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  });

  return `${formatter.format(new Date(event.start))}–${formatter.format(new Date(event.end))}`;
}

function EventDetails({
  event,
  timeZone,
  onClose,
}: {
  event: CalendarEvent;
  timeZone: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="weekly-details"
      aria-labelledby="weekly-details-title"
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="weekly-details__header">
        <h2 id="weekly-details-title">{event.title}</h2>
        <button type="button" onClick={onClose} aria-label="Close event details">
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <dl>
        <div><dt>When</dt><dd>{formatEventTime(event, timeZone)}</dd></div>
        {event.location && <div><dt>Location</dt><dd>{event.location}</dd></div>}
        <div><dt>Source</dt><dd>{event.source.label}</dd></div>
      </dl>
      {event.description && (
        <div className="weekly-details__description">
          <h3>Details</h3>
          <p>{event.description}</p>
        </div>
      )}
    </dialog>
  );
}

function WeeklyCalendar() {
  const householdTimeZone =
    getHouseholdConfig().location.timezone;
  const [windowState, setWindowState] = useState(
    () => createCalendarWindowState(
      new Date(),
      householdTimeZone
    )
  );
  const {
    events,
    timeZone,
    loading,
    error,
    refresh,
  } = useCalendar(windowState.startLocalDate);
  const [selectedEvent, setSelectedEvent] =
    useState<CalendarEvent | null>(null);

  useEffect(() => {
    const updateToday = () => {
      setWindowState(current =>
        refreshCalendarWindowToday(
          current,
          new Date(),
          timeZone
        )
      );
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        updateToday();
      }
    };
    const interval = window.setInterval(updateToday, 60_000);

    window.addEventListener('focus', updateToday);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', updateToday);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [timeZone]);

  const days = useMemo(
    () => selectCalendarWindow(
      events,
      windowState.startLocalDate,
      windowState.householdToday
    ),
    [events, windowState]
  );
  const canNavigatePrevious =
    canNavigateCalendarWindowPrevious(windowState);
  const rangeLabel = formatCalendarWindowRange(
    windowState.startLocalDate
  );

  return (
    <main className="weekly-calendar-page">
      <header className="weekly-calendar-page__header">
        <div>
          <p className="weekly-calendar-page__eyebrow">Household calendar</p>
          <h1>Calendar</h1>
          <p>Rolling seven-day household view</p>
        </div>
      </header>

      <nav className="weekly-calendar-toolbar" aria-label="Calendar date range">
        <strong>{rangeLabel}</strong>
        <div className="weekly-calendar-toolbar__actions">
          <button
            type="button"
            disabled={!canNavigatePrevious}
            onClick={() => setWindowState(current =>
              navigateCalendarWindow(current, -7)
            )}
          >
            <ChevronLeft size={18} aria-hidden="true" />
            Previous 7 days
          </button>
          <button
            type="button"
            onClick={() => setWindowState(current =>
              resetCalendarWindowToToday(current)
            )}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setWindowState(current =>
              navigateCalendarWindow(current, 7)
            )}
          >
            Next 7 days
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </nav>

      {error && (
        <div className="weekly-calendar-page__message" role="alert">
          {error}
          <button type="button" onClick={() => void refresh()}>Try again</button>
        </div>
      )}

      {loading && events.length === 0 ? (
        <div className="weekly-calendar-page__loading">Loading calendar…</div>
      ) : (
        <section className="weekly-calendar" aria-label="Rolling seven-day calendar">
          {days.map(day => (
            <article
              key={day.localDate}
              className={`weekly-day ${day.isToday ? 'weekly-day--today' : ''}`}
            >
              <header className="weekly-day__header">
                {day.isToday && <span className="weekly-day__today">Today</span>}
                <h2>{formatCalendarLocalDate(day.localDate, { weekday: 'short' })}</h2>
                <p>{formatCalendarLocalDate(day.localDate, { day: 'numeric', month: 'short' })}</p>
              </header>

              <div className="weekly-day__events">
                {day.events.length === 0 && (
                  <p className="weekly-day__empty">Nothing planned.</p>
                )}
                {day.events.map(event => (
                  <article
                    key={`${day.localDate}-${event.id}`}
                    className={`weekly-event ${event.allDay ? 'weekly-event--all-day' : ''}`}
                  >
                    <button
                      type="button"
                      className="weekly-event__summary"
                      onClick={() => setSelectedEvent(event)}
                      aria-label={`View ${event.title} details`}
                    >
                      <span className="weekly-event__time">
                        {event.allDay ? <CalendarDays size={14} aria-hidden="true" /> : <Clock3 size={14} aria-hidden="true" />}
                        {formatEventTime(event, timeZone)}
                      </span>
                      <strong>{event.title}</strong>
                      {event.location && (
                        <span className="weekly-event__location">
                          <MapPin size={13} aria-hidden="true" />
                          {event.location}
                        </span>
                      )}
                      <CalendarSourceIndicator source={event.source} />
                    </button>

                    {event.eventKey && ASSIGNABLE_EVENT_KEY.test(event.eventKey) && (
                      <CalendarPeoplePicker
                        eventKey={event.eventKey}
                        assignment={event.profileAssignment}
                        onChanged={refresh}
                      />
                    )}
                  </article>
                ))}
              </div>
            </article>
          ))}
        </section>
      )}

      {selectedEvent && (
        <EventDetails
          event={selectedEvent}
          timeZone={timeZone}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </main>
  );
}

export default WeeklyCalendar;
