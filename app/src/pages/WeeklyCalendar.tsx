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
  canNavigateCalendarMonthPrevious,
  createCalendarMonthState,
  formatCalendarMonthLabel,
  navigateCalendarMonth,
  refreshCalendarMonthToday,
  resetCalendarMonthToToday,
  selectCalendarMonthGrid,
} from '../calendar/calendarMonth';
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

const ASSIGNABLE_EVENT_KEY = /^calendar-event-v1-[a-f0-9]{64}$/;
const MONTH_VISIBLE_EVENT_LIMIT = 2;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
type CalendarView = 'week' | 'month';

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

function useModalDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);
  return dialogRef;
}

function EventCard({
  event,
  timeZone,
  variant,
  onSelect,
  onAssignmentChanged,
}: {
  event: CalendarEvent;
  timeZone: string;
  variant: 'week' | 'month' | 'dialog';
  onSelect: (event: CalendarEvent) => void;
  onAssignmentChanged: () => Promise<void>;
}) {
  return (
    <article className={`calendar-page-event calendar-page-event--${variant} ${event.allDay ? 'calendar-page-event--all-day' : ''}`}>
      <button
        type="button"
        className="calendar-page-event__summary"
        onClick={() => onSelect(event)}
        aria-label={`View ${event.title} details`}
      >
        <span className="calendar-page-event__time">
          {event.allDay
            ? <CalendarDays size={14} aria-hidden="true" />
            : <Clock3 size={14} aria-hidden="true" />}
          {formatEventTime(event, timeZone)}
        </span>
        <strong>{event.title}</strong>
        {event.location && variant !== 'month' && (
          <span className="calendar-page-event__location">
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
          onChanged={onAssignmentChanged}
        />
      )}
    </article>
  );
}

function EventDetails({ event, timeZone, onClose }: {
  event: CalendarEvent;
  timeZone: string;
  onClose: () => void;
}) {
  const dialogRef = useModalDialog();
  return (
    <dialog
      ref={dialogRef}
      className="weekly-details"
      aria-labelledby="weekly-details-title"
      onCancel={dialogEvent => {
        dialogEvent.preventDefault();
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

function DayEventsDialog({
  localDate,
  events,
  timeZone,
  onClose,
  onSelect,
  onAssignmentChanged,
}: {
  localDate: string;
  events: CalendarEvent[];
  timeZone: string;
  onClose: () => void;
  onSelect: (event: CalendarEvent) => void;
  onAssignmentChanged: () => Promise<void>;
}) {
  const dialogRef = useModalDialog();
  const title = formatCalendarLocalDate(localDate, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return (
    <dialog
      ref={dialogRef}
      className="month-day-dialog"
      aria-labelledby="month-day-dialog-title"
      onCancel={dialogEvent => {
        dialogEvent.preventDefault();
        onClose();
      }}
    >
      <div className="weekly-details__header">
        <h2 id="month-day-dialog-title">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close day events">
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="month-day-dialog__events">
        {events.map(event => (
          <EventCard
            key={event.id}
            event={event}
            timeZone={timeZone}
            variant="dialog"
            onSelect={onSelect}
            onAssignmentChanged={onAssignmentChanged}
          />
        ))}
      </div>
    </dialog>
  );
}

function WeeklyCalendar() {
  const householdTimeZone = getHouseholdConfig().location.timezone;
  const [view, setView] = useState<CalendarView>('week');
  const [windowState, setWindowState] = useState(
    () => createCalendarWindowState(new Date(), householdTimeZone)
  );
  const [monthState, setMonthState] = useState(
    () => createCalendarMonthState(new Date(), householdTimeZone)
  );
  const monthWindow = useMemo(
    () => selectCalendarMonthGrid([], monthState.selectedMonthStart, monthState.householdToday),
    [monthState]
  );
  const calendarRequest = useMemo(
    () => view === 'week'
      ? { startLocalDate: windowState.startLocalDate }
      : { startLocalDate: monthWindow.requestStart, days: monthWindow.requestDays },
    [monthWindow.requestDays, monthWindow.requestStart, view, windowState.startLocalDate]
  );
  const { events, timeZone, loading, error, refresh } = useCalendar(calendarRequest);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  useEffect(() => {
    const updateToday = () => {
      const now = new Date();
      setWindowState(current => refreshCalendarWindowToday(current, now, timeZone));
      setMonthState(current => refreshCalendarMonthToday(current, now, timeZone));
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') updateToday();
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

  const weekDays = useMemo(
    () => selectCalendarWindow(events, windowState.startLocalDate, windowState.householdToday),
    [events, windowState]
  );
  const monthGrid = useMemo(
    () => selectCalendarMonthGrid(events, monthState.selectedMonthStart, monthState.householdToday),
    [events, monthState]
  );
  const expandedDayData = expandedDay === null
    ? null
    : monthGrid.days.find(day => day.localDate === expandedDay) ?? null;
  const chooseView = (nextView: CalendarView) => {
    setSelectedEvent(null);
    setExpandedDay(null);
    setView(nextView);
  };
  const showEvent = (event: CalendarEvent) => {
    setExpandedDay(null);
    setSelectedEvent(event);
  };

  return (
    <main className="weekly-calendar-page">
      <header className="weekly-calendar-page__header">
        <div>
          <p className="weekly-calendar-page__eyebrow">Household calendar</p>
          <h1>Calendar</h1>
          <p>{view === 'week' ? 'Rolling seven-day household view' : 'Monthly household view'}</p>
        </div>
        <div className="calendar-view-switch" role="group" aria-label="Calendar view">
          <button type="button" aria-pressed={view === 'week'} onClick={() => chooseView('week')}>7-day</button>
          <button type="button" aria-pressed={view === 'month'} onClick={() => chooseView('month')}>Month</button>
        </div>
      </header>

      {view === 'week' ? (
        <nav className="weekly-calendar-toolbar" aria-label="Calendar date range">
          <strong>{formatCalendarWindowRange(windowState.startLocalDate)}</strong>
          <div className="weekly-calendar-toolbar__actions">
            <button type="button" disabled={!canNavigateCalendarWindowPrevious(windowState)} onClick={() => setWindowState(current => navigateCalendarWindow(current, -7))}>
              <ChevronLeft size={18} aria-hidden="true" />Previous 7 days
            </button>
            <button type="button" onClick={() => setWindowState(current => resetCalendarWindowToToday(current))}>Today</button>
            <button type="button" onClick={() => setWindowState(current => navigateCalendarWindow(current, 7))}>
              Next 7 days<ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </nav>
      ) : (
        <nav className="weekly-calendar-toolbar" aria-label="Calendar month">
          <strong>{formatCalendarMonthLabel(monthState.selectedMonthStart)}</strong>
          <div className="weekly-calendar-toolbar__actions">
            <button type="button" disabled={!canNavigateCalendarMonthPrevious(monthState)} onClick={() => setMonthState(current => navigateCalendarMonth(current, -1))}>
              <ChevronLeft size={18} aria-hidden="true" />Previous month
            </button>
            <button type="button" onClick={() => setMonthState(current => resetCalendarMonthToToday(current))}>Today</button>
            <button type="button" onClick={() => setMonthState(current => navigateCalendarMonth(current, 1))}>
              Next month<ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}

      {error && (
        <div className="weekly-calendar-page__message" role="alert">
          {error}<button type="button" onClick={() => void refresh()}>Try again</button>
        </div>
      )}

      {loading && events.length === 0 ? (
        <div className="weekly-calendar-page__loading" aria-live="polite">Loading calendar…</div>
      ) : view === 'week' ? (
        <section className="weekly-calendar" aria-label="Rolling seven-day calendar">
          {weekDays.map(day => (
            <article key={day.localDate} className={`weekly-day ${day.isToday ? 'weekly-day--today' : ''}`}>
              <header className="weekly-day__header">
                {day.isToday && <span className="weekly-day__today">Today</span>}
                <h2>{formatCalendarLocalDate(day.localDate, { weekday: 'short' })}</h2>
                <p>{formatCalendarLocalDate(day.localDate, { day: 'numeric', month: 'short' })}</p>
              </header>
              <div className="weekly-day__events">
                {day.events.length === 0 && <p className="weekly-day__empty">Nothing planned.</p>}
                {day.events.map(event => (
                  <EventCard key={`${day.localDate}-${event.id}`} event={event} timeZone={timeZone} variant="week" onSelect={showEvent} onAssignmentChanged={refresh} />
                ))}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="month-calendar-scroll">
          <section className={`month-calendar month-calendar--${monthGrid.weekCount}-weeks`} aria-label={`${formatCalendarMonthLabel(monthState.selectedMonthStart)} month calendar`}>
            {WEEKDAYS.map(day => <div key={day} className="month-calendar__weekday" aria-hidden="true">{day}</div>)}
            {monthGrid.days.map(day => {
              const visibleEvents = day.events.slice(0, MONTH_VISIBLE_EVENT_LIMIT);
              const hiddenCount = day.events.length - visibleEvents.length;
              return (
                <article
                  key={day.localDate}
                  className={['month-day', day.isCurrentMonth ? '' : 'month-day--outside', day.isToday ? 'month-day--today' : '', day.isBeforeToday ? 'month-day--history' : ''].filter(Boolean).join(' ')}
                  aria-label={`${formatCalendarLocalDate(day.localDate, { weekday: 'long', day: 'numeric', month: 'long' })}${day.isBeforeToday ? ', history unavailable' : ''}`}
                >
                  <header className="month-day__header">
                    <span className="month-day__number">{formatCalendarLocalDate(day.localDate, { day: 'numeric' })}</span>
                    {day.isToday && <span className="month-day__today">Today</span>}
                  </header>
                  {day.isBeforeToday ? (
                    <p className="month-day__history-label">No history</p>
                  ) : (
                    <div className="month-day__events">
                      {visibleEvents.map(event => (
                        <EventCard key={`${day.localDate}-${event.id}`} event={event} timeZone={timeZone} variant="month" onSelect={showEvent} onAssignmentChanged={refresh} />
                      ))}
                      {hiddenCount > 0 && (
                        <button type="button" className="month-day__more" onClick={() => setExpandedDay(day.localDate)} aria-label={`Show ${hiddenCount} more events on ${formatCalendarLocalDate(day.localDate, { day: 'numeric', month: 'long' })}`}>
                          + {hiddenCount} more
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        </div>
      )}

      {expandedDayData && (
        <DayEventsDialog localDate={expandedDayData.localDate} events={expandedDayData.events} timeZone={timeZone} onClose={() => setExpandedDay(null)} onSelect={showEvent} onAssignmentChanged={refresh} />
      )}
      {selectedEvent && <EventDetails event={selectedEvent} timeZone={timeZone} onClose={() => setSelectedEvent(null)} />}
    </main>
  );
}

export default WeeklyCalendar;
