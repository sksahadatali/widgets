import {
  useMemo,
  useState,
} from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  RefreshCw,
} from 'lucide-react';

import {
  FAMILY_PROFILE_ID,
} from '../../../household/householdProfiles';
import {
  useHouseholdProfile,
} from '../../../household/useHouseholdProfile';
import {
  useRoutineHistory,
} from '../../../hooks/useRoutineHistory';
import {
  getRoutineHistoryMetrics,
  getRoutineHistoryRange,
  selectRoutineHistory,
  shiftLocalDate,
  type RoutineHistoryItem,
  type RoutineHistoryOutcome,
  type RoutineHistoryOutcomeFilter,
  type RoutineHistoryRange,
} from '../../../routines/routineHistory';

import './RoutineHistory.css';

type HistoryRangePreset =
  | '7-days'
  | '30-days'
  | 'all'
  | 'custom';

type RoutineHistoryProps = {
  householdToday: string;
};

const INITIAL_VISIBLE_COUNT = 50;
const VISIBLE_INCREMENT = 50;

const WEEKDAY_LABELS = [
  '',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
];

const OUTCOME_DETAILS: Record<
  RoutineHistoryOutcome,
  { label: string; icon: typeof CheckCircle2 }
> = {
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
  },
  partial: {
    label: 'Partial',
    icon: Circle,
  },
  missed: {
    label: 'Missed',
    icon: AlertTriangle,
  },
};

function formatLocalDate(
  localDate: string
): string {
  const [year, month, day] =
    localDate.split('-').map(Number);
  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  return new Intl.DateTimeFormat(
    'en-GB',
    {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }
  ).format(date);
}

function formatTimestamp(
  timestamp: string,
  timeZone: string
): string | null {
  try {
    return new Intl.DateTimeFormat(
      'en-GB',
      {
        hour: '2-digit',
        minute: '2-digit',
        timeZone,
      }
    ).format(new Date(timestamp));
  } catch {
    return null;
  }
}

function formatCapturedSchedule(
  item: RoutineHistoryItem
): string {
  const { daysOfWeek, startTime, endTime } =
    item.schedule;
  const days = daysOfWeek.length === 7
    ? 'Every day'
    : daysOfWeek.join(',') === '1,2,3,4,5'
      ? 'Weekdays'
      : daysOfWeek.map(
        day => WEEKDAY_LABELS[day]
      ).join(', ');

  if (startTime && endTime) {
    return `${days} · ${startTime}–${endTime}`;
  }

  if (startTime) {
    return `${days} · from ${startTime}`;
  }

  return `${days} · untimed`;
}

function groupByDate(
  items: RoutineHistoryItem[]
): Array<{
  localDate: string;
  items: RoutineHistoryItem[];
}> {
  const groups = new Map<
    string,
    RoutineHistoryItem[]
  >();

  items.forEach(item => {
    const existing =
      groups.get(item.localDate) ?? [];

    existing.push(item);
    groups.set(item.localDate, existing);
  });

  return Array.from(groups).map(
    ([localDate, groupedItems]) => ({
      localDate,
      items: groupedItems,
    })
  );
}

function RoutineHistory({
  householdToday,
}: RoutineHistoryProps) {
  const {
    profiles,
    selectedProfileId,
  } = useHouseholdProfile();
  const {
    occurrences,
    loading,
    error,
    refresh,
  } = useRoutineHistory(householdToday);
  const [rangePreset, setRangePreset] =
    useState<HistoryRangePreset>('7-days');
  const [customStart, setCustomStart] =
    useState(
      shiftLocalDate(householdToday, -7)
    );
  const [customEnd, setCustomEnd] =
    useState(
      shiftLocalDate(householdToday, -1)
    );
  const [outcomeFilter, setOutcomeFilter] =
    useState<RoutineHistoryOutcomeFilter>(
      'all'
    );
  const [routineFilter, setRoutineFilter] =
    useState('all');
  const [visibleState, setVisibleState] =
    useState({
      filterKey: '',
      count: INITIAL_VISIBLE_COUNT,
    });
  const [expandedIds, setExpandedIds] =
    useState<Set<string>>(
      () => new Set()
    );

  const profileById = useMemo(
    () => new Map(
      profiles.map(profile => [
        profile.id,
        profile,
      ])
    ),
    [profiles]
  );

  const allPastRange = useMemo(
    () => getRoutineHistoryRange(
      householdToday,
      null
    ),
    [householdToday]
  );

  const routineOptions = useMemo(() => {
    const allVisibleItems =
      selectRoutineHistory({
        occurrences,
        profiles,
        selectedProfileId,
        householdToday,
        range: allPastRange,
      });
    const labels = new Map<string, string>();

    allVisibleItems.forEach(item => {
      if (!labels.has(item.routineId)) {
        labels.set(item.routineId, item.title);
      }
    });

    return Array.from(labels).map(
      ([id, title]) => ({ id, title })
    );
  }, [
    allPastRange,
    householdToday,
    occurrences,
    profiles,
    selectedProfileId,
  ]);

  const effectiveRoutineFilter =
    routineFilter === 'all' ||
    routineOptions.some(
      option => option.id === routineFilter
    )
      ? routineFilter
      : 'all';

  const range = useMemo<RoutineHistoryRange>(
    () => {
      switch (rangePreset) {
        case '7-days':
          return getRoutineHistoryRange(
            householdToday,
            7
          );
        case '30-days':
          return getRoutineHistoryRange(
            householdToday,
            30
          );
        case 'all':
          return allPastRange;
        case 'custom':
          return {
            startDate: customStart,
            endDate: customEnd,
          };
      }
    },
    [
      allPastRange,
      customEnd,
      customStart,
      householdToday,
      rangePreset,
    ]
  );

  const customRangeInvalid =
    rangePreset === 'custom' &&
    (
      !customStart ||
      !customEnd ||
      customStart > customEnd ||
      customEnd >= householdToday
    );

  const metricItems = useMemo(
    () => customRangeInvalid
      ? []
      : selectRoutineHistory({
        occurrences,
        profiles,
        selectedProfileId,
        householdToday,
        range,
        routineId:
          effectiveRoutineFilter === 'all'
            ? null
            : effectiveRoutineFilter,
      }),
    [
      customRangeInvalid,
      householdToday,
      occurrences,
      profiles,
      range,
      effectiveRoutineFilter,
      selectedProfileId,
    ]
  );

  const filteredItems = useMemo(
    () => outcomeFilter === 'all'
      ? metricItems
      : metricItems.filter(
        item => item.outcome === outcomeFilter
      ),
    [metricItems, outcomeFilter]
  );

  const metrics = useMemo(
    () => getRoutineHistoryMetrics(
      metricItems
    ),
    [metricItems]
  );

  const visibleFilterKey = [
    customEnd,
    customStart,
    outcomeFilter,
    rangePreset,
    effectiveRoutineFilter,
    selectedProfileId,
  ].join('|');
  const visibleCount =
    visibleState.filterKey ===
      visibleFilterKey
      ? visibleState.count
      : INITIAL_VISIBLE_COUNT;

  const visibleItems = filteredItems.slice(
    0,
    visibleCount
  );
  const groupedItems = groupByDate(
    visibleItems
  );
  const latestPastDate = shiftLocalDate(
    householdToday,
    -1
  );

  const toggleExpanded = (
    occurrenceId: string
  ) => {
    setExpandedIds(current => {
      const next = new Set(current);

      if (next.has(occurrenceId)) {
        next.delete(occurrenceId);
      } else {
        next.add(occurrenceId);
      }

      return next;
    });
  };

  return (
    <div className="routine-history">
      <div className="daily-workspace__heading">
        <div>
          <h2>History &amp; Progress</h2>
          <p>
            Based only on recorded occurrences while
            eY OS was running. A day with no recorded
            occurrence is not counted as missed.
          </p>
        </div>
        <span className="daily-date-chip">
          Through {latestPastDate}
        </span>
      </div>

      <div
        className="routine-history__filters"
        aria-label="Routine history filters"
      >
        <fieldset className="routine-history__range">
          <legend>Date range</legend>
          <div className="routine-history__range-buttons">
            {([
              ['7-days', 'Past 7 days'],
              ['30-days', 'Past 30 days'],
              ['all', 'All recorded'],
              ['custom', 'Custom'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={
                  rangePreset === value
                    ? 'routine-history__filter-button routine-history__filter-button--active'
                    : 'routine-history__filter-button'
                }
                aria-pressed={
                  rangePreset === value
                }
                onClick={() =>
                  setRangePreset(value)
                }
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="routine-history__select">
          <span>Outcome</span>
          <select
            value={outcomeFilter}
            onChange={event =>
              setOutcomeFilter(
                event.target.value as
                  RoutineHistoryOutcomeFilter
              )
            }
          >
            <option value="all">All</option>
            <option value="completed">
              Completed
            </option>
            <option value="partial">Partial</option>
            <option value="missed">Missed</option>
          </select>
        </label>

        <label className="routine-history__select">
          <span>Routine</span>
          <select
            value={effectiveRoutineFilter}
            onChange={event =>
              setRoutineFilter(
                event.target.value
              )
            }
          >
            <option value="all">
              All visible routines
            </option>
            {routineOptions.map(option => (
              <option
                key={option.id}
                value={option.id}
              >
                {option.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rangePreset === 'custom' && (
        <div className="routine-history__custom-range">
          <label>
            <span>From</span>
            <input
              type="date"
              value={customStart}
              max={latestPastDate}
              onChange={event =>
                setCustomStart(
                  event.target.value
                )
              }
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              value={customEnd}
              max={latestPastDate}
              onChange={event =>
                setCustomEnd(
                  event.target.value
                )
              }
            />
          </label>
        </div>
      )}

      {customRangeInvalid && (
        <p
          className="routine-history__message routine-history__message--error"
          role="alert"
        >
          <AlertTriangle
            size={18}
            aria-hidden="true"
          />
          Choose a valid past date range.
        </p>
      )}

      {!customRangeInvalid &&
        !loading &&
        !error && (
        <section
          className="routine-history__summary"
          aria-label="Recorded routine summary"
        >
          <div>
            <strong>{metrics.recorded}</strong>
            <span>Recorded</span>
          </div>
          <div>
            <strong>{metrics.completed}</strong>
            <span>Completed</span>
          </div>
          <div>
            <strong>{metrics.partial}</strong>
            <span>Partial</span>
          </div>
          <div>
            <strong>{metrics.missed}</strong>
            <span>Missed</span>
          </div>
          <div className="routine-history__rate">
            <strong>
              {metrics.recordedCompletionRate === null
                ? '—'
                : `${metrics.recordedCompletionRate}%`}
            </strong>
            <span>Recorded completion rate</span>
          </div>
        </section>
      )}

      {error && (
        <div
          className="routine-history__message routine-history__message--error"
          role="alert"
        >
          <AlertTriangle
            size={20}
            aria-hidden="true"
          />
          <span>{error}</span>
          <button
            type="button"
            className="routine-button routine-button--secondary"
            onClick={() => void refresh()}
          >
            <RefreshCw
              size={17}
              aria-hidden="true"
            />
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="routine-history__empty">
          <RefreshCw
            className="routine-spin"
            size={28}
            aria-hidden="true"
          />
          Loading recorded routine history…
        </div>
      ) : !error && !customRangeInvalid &&
        metrics.recorded === 0 ? (
          <div className="routine-history__empty">
            <CalendarDays
              size={34}
              aria-hidden="true"
            />
            <h3>No recorded occurrences in this range.</h3>
            <p>
              Missing dates are not treated as missed
              routines.
            </p>
          </div>
        ) : !error && !customRangeInvalid &&
          filteredItems.length === 0 ? (
            <div className="routine-history__empty">
              <CalendarDays
                size={34}
                aria-hidden="true"
              />
              <h3>No history matches these filters.</h3>
              <p>
                Try another outcome or routine.
              </p>
            </div>
          ) : !error && !customRangeInvalid ? (
            <div className="routine-history__groups">
              {groupedItems.map(group => (
                <section
                  className="routine-history__group"
                  key={group.localDate}
                  aria-labelledby={`history-date-${group.localDate}`}
                >
                  <header className="routine-history__date-heading">
                    <h3
                      id={`history-date-${group.localDate}`}
                    >
                      {formatLocalDate(
                        group.localDate
                      )}
                    </h3>
                    <span>
                      {group.items.length}{' '}
                      {group.items.length === 1
                        ? 'recorded routine'
                        : 'recorded routines'}
                    </span>
                  </header>

                  <div className="routine-history__list">
                    {group.items.map(item => {
                      const details =
                        OUTCOME_DETAILS[item.outcome];
                      const OutcomeIcon =
                        details.icon;
                      const owner = profileById.get(
                        item.ownerProfileId
                      );
                      const ownerLabel =
                        item.ownerProfileId ===
                          FAMILY_PROFILE_ID
                          ? 'Family'
                          : owner?.displayName ??
                            item.ownerProfileId;
                      const isExpanded =
                        expandedIds.has(
                          item.occurrenceId
                        );
                      const completionTime =
                        item.outcome === 'completed' &&
                        item.completedAt
                          ? formatTimestamp(
                            item.completedAt,
                            item.timeZone
                          )
                          : null;
                      const checklistId =
                        `history-checklist-${item.occurrenceId}`;

                      return (
                        <article
                          className={`routine-history-item routine-history-item--${item.outcome}`}
                          key={item.occurrenceId}
                        >
                          <div className="routine-history-item__main">
                            <div className="routine-history-item__content">
                              <div className="routine-history-item__title-row">
                                <h4>{item.title}</h4>
                                <span
                                  className={`routine-history-item__outcome routine-history-item__outcome--${item.outcome}`}
                                >
                                  <OutcomeIcon
                                    size={17}
                                    aria-hidden="true"
                                  />
                                  {details.label}
                                </span>
                              </div>
                              <p>
                                {ownerLabel}
                                {' · '}
                                {formatCapturedSchedule(
                                  item
                                )}
                                {' · '}
                                {item.completedStepCount}/
                                {item.totalStepCount} steps
                                {completionTime
                                  ? ` · completed ${completionTime}`
                                  : ''}
                              </p>
                              {item.snapshotSource ===
                                'legacy-migration' && (
                                <small>
                                  Migrated record: its snapshot
                                  was reconstructed from the
                                  definition available during the
                                  schema-v1 migration.
                                </small>
                              )}
                            </div>

                            <button
                              type="button"
                              className="routine-history-item__toggle"
                              aria-expanded={isExpanded}
                              aria-controls={checklistId}
                              onClick={() =>
                                toggleExpanded(
                                  item.occurrenceId
                                )
                              }
                            >
                              {isExpanded
                                ? 'Hide checklist'
                                : 'Show checklist'}
                              {isExpanded ? (
                                <ChevronUp
                                  size={18}
                                  aria-hidden="true"
                                />
                              ) : (
                                <ChevronDown
                                  size={18}
                                  aria-hidden="true"
                                />
                              )}
                            </button>
                          </div>

                          {isExpanded && (
                            <ol
                              id={checklistId}
                              className="routine-history-item__checklist"
                            >
                              {item.steps.map(step => {
                                const completedTimestamp =
                                  item.completedSteps[
                                    step.id
                                  ];
                                const stepTime =
                                  completedTimestamp
                                    ? formatTimestamp(
                                      completedTimestamp,
                                      item.timeZone
                                    )
                                    : null;

                                return (
                                  <li key={step.id}>
                                    <span
                                      className={
                                        completedTimestamp
                                          ? 'routine-history-item__step-icon routine-history-item__step-icon--complete'
                                          : 'routine-history-item__step-icon'
                                      }
                                    >
                                      {completedTimestamp ? (
                                        <Check
                                          size={16}
                                          aria-hidden="true"
                                        />
                                      ) : (
                                        <Circle
                                          size={16}
                                          aria-hidden="true"
                                        />
                                      )}
                                    </span>
                                    <span>{step.title}</span>
                                    {stepTime && (
                                      <time
                                        dateTime={
                                          completedTimestamp
                                        }
                                      >
                                        {stepTime}
                                      </time>
                                    )}
                                  </li>
                                );
                              })}
                            </ol>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}

              {visibleCount <
                filteredItems.length && (
                <button
                  type="button"
                  className="routine-history__show-more"
                  onClick={() =>
                    setVisibleState({
                      filterKey: visibleFilterKey,
                      count:
                        visibleCount +
                        VISIBLE_INCREMENT,
                    })
                  }
                  aria-label={`Show ${Math.min(
                    VISIBLE_INCREMENT,
                    filteredItems.length - visibleCount
                  )} more routine history records`}
                >
                  Show more
                </button>
              )}
            </div>
          ) : null}
    </div>
  );
}

export default RoutineHistory;
