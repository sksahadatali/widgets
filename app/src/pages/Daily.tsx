import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  Edit3,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from 'lucide-react';

import {
  FAMILY_PROFILE_ID,
} from '../household/householdProfiles';
import {
  useHouseholdProfile,
} from '../household/useHouseholdProfile';
import {
  useRoutines,
} from '../hooks/useRoutines';
import {
  getRoutineWindowState,
  isRoutineComplete,
} from '../routines/recurrence';
import type {
  IsoWeekday,
  RoutineDefinition,
  RoutineDefinitionInput,
  RoutineOccurrence,
  RoutineStep,
  RoutineWindowState,
} from '../types/routine';

import './Daily.css';

type DailyTab =
  | 'today'
  | 'manage';

const WEEKDAYS: Array<{
  id: IsoWeekday;
  short: string;
  name: string;
}> = [
  { id: 1, short: 'M', name: 'Monday' },
  { id: 2, short: 'T', name: 'Tuesday' },
  { id: 3, short: 'W', name: 'Wednesday' },
  { id: 4, short: 'T', name: 'Thursday' },
  { id: 5, short: 'F', name: 'Friday' },
  { id: 6, short: 'S', name: 'Saturday' },
  { id: 7, short: 'S', name: 'Sunday' },
];

const STATUS_DETAILS: Record<
  RoutineWindowState,
  { label: string; icon: typeof Clock3 }
> = {
  upcoming: {
    label: 'Upcoming',
    icon: Clock3,
  },
  current: {
    label: 'Now',
    icon: CalendarClock,
  },
  overdue: {
    label: 'Still incomplete',
    icon: AlertTriangle,
  },
  complete: {
    label: 'Completed',
    icon: CheckCircle2,
  },
};

function formatSchedule(
  routine: RoutineDefinition
): string {
  const days = routine.schedule.daysOfWeek;
  const dayLabel =
    days.length === 7
      ? 'Every day'
      : days.join(', ') === '1, 2, 3, 4, 5'
        ? 'Weekdays'
        : days.map(day =>
          WEEKDAYS.find(
            weekday => weekday.id === day
          )?.name.slice(0, 3)
        ).join(', ');
  const {
    startTime,
    endTime,
  } = routine.schedule;

  if (startTime && endTime) {
    return `${dayLabel} · ${startTime}–${endTime}`;
  }

  if (startTime) {
    return `${dayLabel} · from ${startTime}`;
  }

  return dayLabel;
}

function RoutineChecklist({
  routine,
  occurrence,
  status,
  disabled,
  onStepChange,
}: {
  routine: RoutineDefinition;
  occurrence: RoutineOccurrence | undefined;
  status: RoutineWindowState;
  disabled: boolean;
  onStepChange: (
    routine: RoutineDefinition,
    stepId: string,
    completed: boolean
  ) => Promise<void>;
}) {
  const StatusIcon =
    STATUS_DETAILS[status].icon;
  const completedCount =
    routine.steps.filter(step =>
      Boolean(
        occurrence?.completedSteps[step.id]
      )
    ).length;

  return (
    <article
      className={`routine-card routine-card--${status}`}
    >
      <header className="routine-card__header">
        <div>
          <h3>{routine.title}</h3>
          <p>{formatSchedule(routine)}</p>
        </div>

        <span className="routine-card__status">
          <StatusIcon
            size={18}
            aria-hidden="true"
          />
          {STATUS_DETAILS[status].label}
        </span>
      </header>

      <div className="routine-card__progress">
        <span>
          {completedCount} of {routine.steps.length}
          {' '}steps
        </span>
        <span
          aria-label={`${completedCount} of ${routine.steps.length} steps completed`}
        >
          {Math.round(
            completedCount /
              routine.steps.length *
              100
          )}%
        </span>
      </div>

      <ul className="routine-checklist">
        {routine.steps.map(step => {
          const isCompleted = Boolean(
            occurrence?.completedSteps[step.id]
          );

          return (
            <li key={step.id}>
              <label
                className={`routine-step ${
                  isCompleted
                    ? 'routine-step--completed'
                    : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={isCompleted}
                  disabled={disabled}
                  onChange={event => {
                    void onStepChange(
                      routine,
                      step.id,
                      event.target.checked
                    ).catch(() => undefined);
                  }}
                />
                <span className="routine-step__check">
                  {isCompleted && (
                    <Check
                      size={18}
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span>{step.title}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function RoutineEditor({
  routine,
  onCancel,
  onSave,
  saving,
}: {
  routine: RoutineDefinition | null;
  onCancel: () => void;
  onSave: (
    input: RoutineDefinitionInput,
    routineId?: string
  ) => Promise<void>;
  saving: boolean;
}) {
  const { profiles } =
    useHouseholdProfile();
  const [title, setTitle] = useState(
    routine?.title ?? ''
  );
  const [ownerProfileId, setOwnerProfileId] =
    useState(
      routine?.ownerProfileId ??
        FAMILY_PROFILE_ID
    );
  const [active, setActive] = useState(
    routine?.active ?? true
  );
  const [daysOfWeek, setDaysOfWeek] =
    useState<IsoWeekday[]>(
      routine?.schedule.daysOfWeek ??
        [1, 2, 3, 4, 5, 6, 7]
    );
  const [startTime, setStartTime] = useState(
    routine?.schedule.startTime ?? ''
  );
  const [endTime, setEndTime] = useState(
    routine?.schedule.endTime ?? ''
  );
  const [steps, setSteps] = useState<
    RoutineStep[]
  >(
    routine?.steps ?? [
      {
        id: crypto.randomUUID(),
        title: '',
      },
    ]
  );
  const [validationError, setValidationError] =
    useState<string | null>(null);

  const toggleDay = (day: IsoWeekday) => {
    setDaysOfWeek(current =>
      current.includes(day)
        ? current.filter(
          candidate => candidate !== day
        )
        : [...current, day].sort(
          (left, right) => left - right
        )
    );
  };

  const moveStep = (
    index: number,
    direction: -1 | 1
  ) => {
    setSteps(current => {
      const nextIndex = index + direction;

      if (
        nextIndex < 0 ||
        nextIndex >= current.length
      ) {
        return current;
      }

      const next = [...current];
      [next[index], next[nextIndex]] = [
        next[nextIndex],
        next[index],
      ];
      return next;
    });
  };

  const submit = async () => {
    const normalizedSteps = steps
      .map(step => ({
        ...step,
        title: step.title.trim(),
      }))
      .filter(step => step.title);

    if (!title.trim()) {
      setValidationError(
        'Enter a routine title.'
      );
      return;
    }

    if (daysOfWeek.length === 0) {
      setValidationError(
        'Select at least one day.'
      );
      return;
    }

    if (normalizedSteps.length === 0) {
      setValidationError(
        'Add at least one checklist step.'
      );
      return;
    }

    if (endTime && !startTime) {
      setValidationError(
        'Choose a start time before an end time.'
      );
      return;
    }

    if (
      startTime &&
      endTime &&
      endTime <= startTime
    ) {
      setValidationError(
        'The end time must be later on the same day. Cross-midnight routines are not supported yet.'
      );
      return;
    }

    setValidationError(null);

    try {
      await onSave(
        {
          title: title.trim(),
          ownerProfileId,
          active,
          schedule: {
            daysOfWeek,
            startTime: startTime || null,
            endTime: endTime || null,
          },
          steps: normalizedSteps,
        },
        routine?.id
      );
      onCancel();
    } catch {
      // The page-level error banner describes service failures.
    }
  };

  return (
    <section
      className="routine-editor"
      aria-labelledby="routine-editor-title"
    >
      <header className="routine-editor__header">
        <div>
          <span className="daily-page__eyebrow">
            {routine
              ? 'Edit routine'
              : 'New routine'}
          </span>
          <h2 id="routine-editor-title">
            {routine?.title ||
              'Build a repeatable checklist'}
          </h2>
        </div>

        <button
          type="button"
          className="routine-button routine-button--icon"
          onClick={onCancel}
          aria-label="Close routine editor"
        >
          <X size={22} aria-hidden="true" />
        </button>
      </header>

      {validationError && (
        <p
          className="routine-message routine-message--error"
          role="alert"
        >
          <AlertTriangle
            size={18}
            aria-hidden="true"
          />
          {validationError}
        </p>
      )}

      <div className="routine-editor__grid">
        <label className="routine-field routine-field--wide">
          <span>Routine title</span>
          <input
            type="text"
            value={title}
            onChange={event =>
              setTitle(event.target.value)
            }
            placeholder="e.g. School-morning preparation"
            autoFocus
          />
        </label>

        <label className="routine-field">
          <span>Owner</span>
          <select
            value={ownerProfileId}
            onChange={event =>
              setOwnerProfileId(
                event.target.value
              )
            }
          >
            {profiles.map(profile => (
              <option
                key={profile.id}
                value={profile.id}
              >
                {profile.kind === 'family'
                  ? 'Family'
                  : profile.displayName}
              </option>
            ))}
          </select>
        </label>

        <label className="routine-field routine-field--toggle">
          <span>Availability</span>
          <span className="routine-editor__active">
            <input
              type="checkbox"
              checked={active}
              onChange={event =>
                setActive(
                  event.target.checked
                )
              }
            />
            Active
          </span>
        </label>
      </div>

      <fieldset className="routine-editor__fieldset">
        <legend>Scheduled days</legend>
        <div className="routine-days">
          {WEEKDAYS.map(day => (
            <button
              key={day.id}
              type="button"
              className={
                daysOfWeek.includes(day.id)
                  ? 'routine-day routine-day--selected'
                  : 'routine-day'
              }
              onClick={() => toggleDay(day.id)}
              aria-pressed={
                daysOfWeek.includes(day.id)
              }
              aria-label={day.name}
            >
              {day.short}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="routine-editor__times">
        <label className="routine-field">
          <span>Start time (optional)</span>
          <input
            type="time"
            value={startTime}
            onChange={event =>
              setStartTime(event.target.value)
            }
          />
        </label>

        <label className="routine-field">
          <span>End time (optional)</span>
          <input
            type="time"
            value={endTime}
            onChange={event =>
              setEndTime(event.target.value)
            }
          />
        </label>
      </div>

      <fieldset className="routine-editor__fieldset">
        <legend>Checklist steps</legend>
        <div className="routine-editor__steps">
          {steps.map((step, index) => (
            <div
              className="routine-editor-step"
              key={step.id}
            >
              <span className="routine-editor-step__number">
                {index + 1}
              </span>
              <input
                type="text"
                value={step.title}
                onChange={event =>
                  setSteps(current =>
                    current.map(candidate =>
                      candidate.id === step.id
                        ? {
                          ...candidate,
                          title: event.target.value,
                        }
                        : candidate
                    )
                  )
                }
                aria-label={`Step ${index + 1}`}
                placeholder="Checklist step"
              />
              <button
                type="button"
                onClick={() => moveStep(index, -1)}
                disabled={index === 0}
                aria-label={`Move step ${index + 1} up`}
              >
                <ArrowUp size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => moveStep(index, 1)}
                disabled={index === steps.length - 1}
                aria-label={`Move step ${index + 1} down`}
              >
                <ArrowDown size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setSteps(current =>
                    current.filter(
                      candidate =>
                        candidate.id !== step.id
                    )
                  )
                }
                disabled={steps.length === 1}
                aria-label={`Remove step ${index + 1}`}
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="routine-button routine-button--secondary"
          onClick={() =>
            setSteps(current => [
              ...current,
              {
                id: crypto.randomUUID(),
                title: '',
              },
            ])
          }
        >
          <Plus size={18} aria-hidden="true" />
          Add step
        </button>
      </fieldset>

      <footer className="routine-editor__actions">
        <button
          type="button"
          className="routine-button routine-button--secondary"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="routine-button routine-button--primary"
          onClick={() => void submit()}
          disabled={saving}
        >
          {saving
            ? 'Saving…'
            : 'Save routine'}
        </button>
      </footer>
    </section>
  );
}

function Daily() {
  const {
    profiles,
    selectedProfile,
    isFamilySelected,
  } = useHouseholdProfile();
  const {
    routines,
    todayRoutines,
    occurrenceByRoutineId,
    dateInfo,
    timeZone,
    loading,
    saving,
    error,
    refresh,
    saveRoutine,
    removeRoutine,
    setStepCompleted,
  } = useRoutines();
  const [tab, setTab] =
    useState<DailyTab>('today');
  const [editorRoutine, setEditorRoutine] =
    useState<RoutineDefinition | null | undefined>(
      undefined
    );
  const [deleteCandidate, setDeleteCandidate] =
    useState<RoutineDefinition | null>(null);

  useEffect(() => {
    if (!deleteCandidate) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDeleteCandidate(null);
      }
    };

    window.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, [deleteCandidate]);

  const profileById = useMemo(
    () => new Map(
      profiles.map(profile => [
        profile.id,
        profile,
      ])
    ),
    [profiles]
  );

  const groupedToday = useMemo(() => {
    const groups = profiles
      .map(profile => ({
        profile,
        routines: todayRoutines.filter(
          routine =>
            routine.ownerProfileId === profile.id
        ),
      }))
      .filter(group => group.routines.length > 0);

    return isFamilySelected
      ? groups
      : groups.filter(group =>
        group.profile.id === FAMILY_PROFILE_ID ||
        group.profile.id === selectedProfile.id
      );
  }, [
    isFamilySelected,
    profiles,
    selectedProfile.id,
    todayRoutines,
  ]);

  const activeCount = routines.filter(
    routine => routine.active
  ).length;
  const completedCount = todayRoutines.filter(
    routine =>
      isRoutineComplete(
        routine,
        occurrenceByRoutineId.get(routine.id)
      )
  ).length;

  return (
    <main className="daily-page">
      <header className="daily-page__header">
        <div>
          <span className="daily-page__eyebrow">
            Shared household routines
          </span>
          <h1>Daily</h1>
          <p>
            Repeatable checklists for Family and
            household members.
          </p>
        </div>

        <div className="daily-page__summary">
          <strong>
            {completedCount}/{todayRoutines.length}
          </strong>
          <span>today complete</span>
          <small>{timeZone}</small>
        </div>
      </header>

      <div
        className="daily-tabs"
        role="tablist"
        aria-label="Routine workspace"
      >
        <button
          type="button"
          id="daily-tab-today"
          role="tab"
          aria-controls="daily-panel-today"
          aria-selected={tab === 'today'}
          className={
            tab === 'today'
              ? 'daily-tab daily-tab--active'
              : 'daily-tab'
          }
          onClick={() => {
            setTab('today');
            setEditorRoutine(undefined);
          }}
        >
          <CheckCircle2 size={20} aria-hidden="true" />
          Today
        </button>

        <button
          type="button"
          id="daily-tab-manage"
          role="tab"
          aria-controls="daily-panel-manage"
          aria-selected={tab === 'manage'}
          className={
            tab === 'manage'
              ? 'daily-tab daily-tab--active'
              : 'daily-tab'
          }
          onClick={() => setTab('manage')}
        >
          <CalendarClock size={20} aria-hidden="true" />
          Manage Routines
        </button>
      </div>

      {error && (
        <div
          className="routine-message routine-message--error"
          role="alert"
        >
          <AlertTriangle size={20} aria-hidden="true" />
          <span>{error}</span>
          <button
            type="button"
            className="routine-button routine-button--secondary"
            onClick={() => void refresh()}
          >
            <RefreshCw size={17} aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {tab === 'today' && (
        <section
          id="daily-panel-today"
          className="daily-workspace"
          role="tabpanel"
          aria-labelledby="daily-tab-today"
        >
          <div className="daily-workspace__heading">
            <div>
              <h2>
                {isFamilySelected
                  ? 'Family routines today'
                  : `${selectedProfile.displayName}'s routines today`}
              </h2>
              <p>
                Family routines are included in each
                member’s view. Completion resets by
                scheduled local date, not by a timer.
              </p>
            </div>
            <span className="daily-date-chip">
              {dateInfo.localDate}
            </span>
          </div>

          {loading ? (
            <div className="routine-empty">
              <RefreshCw
                className="routine-spin"
                size={28}
                aria-hidden="true"
              />
              Loading today’s routines…
            </div>
          ) : groupedToday.length === 0 ? (
            <div className="routine-empty">
              <CheckCircle2 size={34} aria-hidden="true" />
              <h3>No routines scheduled for this view today.</h3>
              <p>
                Use Manage Routines to add or activate a
                repeatable checklist.
              </p>
            </div>
          ) : (
            <div className="routine-groups">
              {groupedToday.map(group => (
                <section
                  key={group.profile.id}
                  className="routine-group"
                >
                  <header className="routine-group__header">
                    <Users size={20} aria-hidden="true" />
                    <h3>
                      {group.profile.kind === 'family'
                        ? 'Family'
                        : group.profile.displayName}
                    </h3>
                    <span>
                      {group.routines.length}{' '}
                      {group.routines.length === 1
                        ? 'routine'
                        : 'routines'}
                    </span>
                  </header>

                  <div className="routine-grid">
                    {group.routines.map(routine => {
                      const occurrence =
                        occurrenceByRoutineId.get(
                          routine.id
                        );
                      const status =
                        getRoutineWindowState(
                          routine,
                          occurrence,
                          dateInfo
                        );

                      return (
                        <RoutineChecklist
                          key={routine.id}
                          routine={routine}
                          occurrence={occurrence}
                          status={status}
                          disabled={saving}
                          onStepChange={
                            setStepCompleted
                          }
                        />
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'manage' && (
        <section
          id="daily-panel-manage"
          className="daily-workspace"
          role="tabpanel"
          aria-labelledby="daily-tab-manage"
        >
          {editorRoutine !== undefined ? (
            <RoutineEditor
              key={editorRoutine?.id ?? 'new'}
              routine={editorRoutine}
              onCancel={() =>
                setEditorRoutine(undefined)
              }
              onSave={saveRoutine}
              saving={saving}
            />
          ) : (
            <>
              <div className="daily-workspace__heading">
                <div>
                  <h2>Manage Routines</h2>
                  <p>
                    Deactivate a routine to stop it
                    without removing its definition or
                    occurrence history.
                  </p>
                </div>
                <button
                  type="button"
                  className="routine-button routine-button--primary"
                  onClick={() =>
                    setEditorRoutine(null)
                  }
                >
                  <Plus size={20} aria-hidden="true" />
                  New routine
                </button>
              </div>

              <div className="routine-manage-summary">
                <span>{routines.length} total</span>
                <span>{activeCount} active</span>
                <span>{routines.length - activeCount} inactive</span>
              </div>

              {loading ? (
                <div className="routine-empty">
                  Loading routines…
                </div>
              ) : routines.length === 0 ? (
                <div className="routine-empty">
                  <CalendarClock size={34} aria-hidden="true" />
                  <h3>No routines yet.</h3>
                  <p>
                    Create the first repeatable household
                    checklist.
                  </p>
                </div>
              ) : (
                <div className="routine-manage-list">
                  {routines.map(routine => {
                    const owner = profileById.get(
                      routine.ownerProfileId
                    );
                    const isOrphaned = !owner;

                    return (
                      <article
                        key={routine.id}
                        className={`routine-manage-item ${
                          routine.active
                            ? ''
                            : 'routine-manage-item--inactive'
                        }`}
                      >
                        <div className="routine-manage-item__content">
                          <div className="routine-manage-item__title">
                            <h3>{routine.title}</h3>
                            <span
                              className={
                                routine.active
                                  ? 'routine-state routine-state--active'
                                  : 'routine-state'
                              }
                            >
                              {routine.active
                                ? 'Active'
                                : 'Inactive'}
                            </span>
                            {isOrphaned && (
                              <span className="routine-state routine-state--warning">
                                Owner missing
                              </span>
                            )}
                          </div>
                          <p>
                            {owner
                              ? owner.kind === 'family'
                                ? 'Family'
                                : owner.displayName
                              : `Unassigned profile (${routine.ownerProfileId})`}
                            {' · '}
                            {formatSchedule(routine)}
                            {' · '}
                            {routine.steps.length} steps
                          </p>
                          {isOrphaned && (
                            <small>
                              This routine is excluded from
                              Today until it is reassigned.
                            </small>
                          )}
                        </div>

                        <div className="routine-manage-item__actions">
                          <button
                            type="button"
                            className="routine-button routine-button--secondary"
                            disabled={saving}
                            onClick={() => {
                              void saveRoutine(
                                {
                                  title: routine.title,
                                  ownerProfileId:
                                    routine.ownerProfileId,
                                  active: !routine.active,
                                  schedule: routine.schedule,
                                  steps: routine.steps,
                                },
                                routine.id
                              ).catch(() => undefined);
                            }}
                          >
                            {routine.active
                              ? 'Deactivate'
                              : 'Activate'}
                          </button>
                          <button
                            type="button"
                            className="routine-button routine-button--secondary"
                            onClick={() =>
                              setEditorRoutine(routine)
                            }
                          >
                            <Edit3 size={18} aria-hidden="true" />
                            Edit
                          </button>
                          <button
                            type="button"
                            className="routine-button routine-button--danger"
                            onClick={() =>
                              setDeleteCandidate(routine)
                            }
                          >
                            <Trash2 size={18} aria-hidden="true" />
                            Delete
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {deleteCandidate && (
        <div
          className="routine-dialog-backdrop"
          role="presentation"
        >
          <section
            className="routine-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-routine-title"
            aria-describedby="delete-routine-description"
          >
            <AlertTriangle
              size={34}
              aria-hidden="true"
            />
            <h2 id="delete-routine-title">
              Permanently delete this routine?
            </h2>
            <p id="delete-routine-description">
              <strong>{deleteCandidate.title}</strong>
              {' '}and all of its recorded occurrence
              history will be permanently removed. This
              cannot be undone. Deactivate it instead if
              you may need it later.
            </p>
            <div className="routine-dialog__actions">
              <button
                type="button"
                className="routine-button routine-button--secondary"
                onClick={() => setDeleteCandidate(null)}
                autoFocus
              >
                Cancel
              </button>
              <button
                type="button"
                className="routine-button routine-button--danger-solid"
                disabled={saving}
                onClick={() => {
                  void removeRoutine(
                    deleteCandidate.id
                  )
                    .then(() =>
                      setDeleteCandidate(null)
                    )
                    .catch(() => undefined);
                }}
              >
                Permanently delete
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default Daily;
