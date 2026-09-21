import {
  useMemo,
  useState,
} from 'react';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Star,
} from 'lucide-react';

import type {
  HouseholdProfile,
} from '../../../household/householdProfiles';
import {
  getCompletedStepCount,
  isRoutineComplete,
} from '../../../routines/recurrence';
import {
  addRoutineDays,
  getRoutineWeekDates,
  getRoutineWeekStart,
  selectRoutineWeekEntries,
} from '../../../routines/routineWeek';
import type {
  RoutineDefinition,
  RoutineOccurrence,
} from '../../../types/routine';

type RoutineWeekProps = {
  routines: RoutineDefinition[];
  occurrences: RoutineOccurrence[];
  profiles: HouseholdProfile[];
  selectedProfileId: string;
  householdToday: string;
  loading: boolean;
  saving: boolean;
  onStepChange: (
    routine: RoutineDefinition,
    stepId: string,
    completed: boolean,
    localDate: string
  ) => Promise<void>;
  onRoutineChange: (
    routine: RoutineDefinition,
    completed: boolean,
    localDate: string
  ) => Promise<void>;
};

const DAY_FORMATTER = new Intl.DateTimeFormat(
  'en-GB',
  {
    weekday: 'short',
    timeZone: 'UTC',
  }
);
const DATE_FORMATTER = new Intl.DateTimeFormat(
  'en-GB',
  {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }
);
const RANGE_FORMATTER = new Intl.DateTimeFormat(
  'en-GB',
  {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }
);

function asUtcDate(localDate: string): Date {
  return new Date(`${localDate}T00:00:00.000Z`);
}

function formatRange(
  startDate: string,
  endDate: string
): string {
  return `${RANGE_FORMATTER.format(
    asUtcDate(startDate)
  )} – ${RANGE_FORMATTER.format(
    asUtcDate(endDate)
  )}`;
}

function profileLabel(
  profiles: HouseholdProfile[],
  profileId: string
): string {
  const profile = profiles.find(
    candidate => candidate.id === profileId
  );

  return profile?.kind === 'family'
    ? 'Family'
    : profile?.displayName ?? 'Unknown';
}

function CompactRoutine({
  routine,
  occurrence,
  localDate,
  ownerLabel,
  saving,
  onStepChange,
  onRoutineChange,
}: {
  routine: RoutineDefinition;
  occurrence: RoutineOccurrence | undefined;
  localDate: string;
  ownerLabel: string;
  saving: boolean;
  onStepChange: RoutineWeekProps['onStepChange'];
  onRoutineChange: RoutineWeekProps['onRoutineChange'];
}) {
  const completedCount = getCompletedStepCount(
    routine,
    occurrence
  );
  const completed = isRoutineComplete(
    routine,
    occurrence
  );

  return (
    <article
      className={`routine-week-entry ${
        completed
          ? 'routine-week-entry--completed'
          : ''
      }`}
    >
      <header className="routine-week-entry__header">
        <h3>{routine.title}</h3>
        {(
          occurrence?.rewardContract ??
          routine.reward
        ) && (
          <span
            className="routine-week-entry__reward"
            aria-label={`${(
              occurrence?.rewardContract ??
              routine.reward
            )?.amount} stars for completion`}
          >
            <Star size={14} aria-hidden="true" />
            {(
              occurrence?.rewardContract ??
              routine.reward
            )?.amount}
          </span>
        )}
      </header>

      <p className="routine-week-entry__meta">
        {ownerLabel}
        {routine.steps.length > 0 && (
          <> · {completedCount}/{routine.steps.length}</>
        )}
      </p>

      <div className="routine-week-entry__actions">
        {routine.steps.length === 0 ? (
          <label
            className={`routine-week-action ${
              completed
                ? 'routine-week-action--completed'
                : ''
            }`}
          >
            <input
              type="checkbox"
              checked={completed}
              disabled={saving}
              onChange={event => {
                void onRoutineChange(
                  routine,
                  event.target.checked,
                  localDate
                ).catch(() => undefined);
              }}
            />
            <span className="routine-week-action__check">
              {completed && (
                <Check size={14} aria-hidden="true" />
              )}
            </span>
            <span>Complete</span>
          </label>
        ) : routine.steps.map(step => {
          const stepCompleted = Boolean(
            occurrence?.completedSteps[step.id]
          );

          return (
            <label
              key={step.id}
              className={`routine-week-action ${
                stepCompleted
                  ? 'routine-week-action--completed'
                  : ''
              }`}
            >
              <input
                type="checkbox"
                checked={stepCompleted}
                disabled={saving}
                onChange={event => {
                  void onStepChange(
                    routine,
                    step.id,
                    event.target.checked,
                    localDate
                  ).catch(() => undefined);
                }}
              />
              <span className="routine-week-action__check">
                {stepCompleted && (
                  <Check size={14} aria-hidden="true" />
                )}
              </span>
              <span>{step.title}</span>
            </label>
          );
        })}
      </div>
    </article>
  );
}

export default function RoutineWeek({
  routines,
  occurrences,
  profiles,
  selectedProfileId,
  householdToday,
  loading,
  saving,
  onStepChange,
  onRoutineChange,
}: RoutineWeekProps) {
  const todayWeekStart = useMemo(
    () => getRoutineWeekStart(householdToday),
    [householdToday]
  );
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = useMemo(
    () => addRoutineDays(
      todayWeekStart,
      weekOffset * 7
    ),
    [todayWeekStart, weekOffset]
  );

  const dates = useMemo(
    () => getRoutineWeekDates(weekStart),
    [weekStart]
  );
  const weekEnd = dates[dates.length - 1];

  return (
    <section
      className="routine-week"
      aria-labelledby="routine-week-title"
    >
      <div className="routine-week__heading">
        <div>
          <h2 id="routine-week-title">7-day routines</h2>
          <p>
            Complete each routine from its scheduled household day.
          </p>
        </div>

        <nav
          className="routine-week__navigation"
          aria-label="Routine week navigation"
        >
          <button
            type="button"
            className="routine-button routine-button--secondary"
            onClick={() =>
              setWeekOffset(current => current - 1)
            }
          >
            <ChevronLeft size={17} aria-hidden="true" />
            Previous 7 days
          </button>

          <strong aria-live="polite">
            {formatRange(weekStart, weekEnd)}
          </strong>

          <button
            type="button"
            className="routine-button routine-button--secondary"
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
          >
            <CalendarDays size={17} aria-hidden="true" />
            Today
          </button>

          <button
            type="button"
            className="routine-button routine-button--secondary"
            onClick={() =>
              setWeekOffset(current => current + 1)
            }
          >
            Next 7 days
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        </nav>
      </div>

      {loading ? (
        <div className="routine-empty">
          Loading seven-day routines…
        </div>
      ) : (
        <div
          className="routine-week__scroll"
          tabIndex={0}
          aria-label="Seven-day routine grid; scroll horizontally when needed"
        >
          <div className="routine-week__grid">
            {dates.map(localDate => {
              const entries = selectRoutineWeekEntries({
                routines,
                occurrences,
                profiles,
                selectedProfileId,
                localDate,
                householdToday,
              });
              const date = asUtcDate(localDate);
              const isToday =
                localDate === householdToday;

              return (
                <section
                  key={localDate}
                  className={`routine-week-day ${
                    isToday
                      ? 'routine-week-day--today'
                      : ''
                  }`}
                  aria-label={`${DAY_FORMATTER.format(date)} ${DATE_FORMATTER.format(date)}`}
                >
                  <header className="routine-week-day__header">
                    <strong>{DAY_FORMATTER.format(date)}</strong>
                    <span>{DATE_FORMATTER.format(date)}</span>
                    {isToday && <em>Today</em>}
                  </header>

                  <div className="routine-week-day__entries">
                    {entries.length === 0 ? (
                      <p className="routine-week-day__empty">
                        No routines
                      </p>
                    ) : entries.map(entry => (
                      <CompactRoutine
                        key={entry.routine.id}
                        routine={entry.routine}
                        occurrence={entry.occurrence}
                        localDate={localDate}
                        ownerLabel={profileLabel(
                          profiles,
                          entry.routine.ownerProfileId
                        )}
                        saving={saving}
                        onStepChange={onStepChange}
                        onRoutineChange={onRoutineChange}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
