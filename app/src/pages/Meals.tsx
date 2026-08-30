import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useMeals } from '../hooks/useMeals';
import {
  createMealCalendarState,
  formatMealLocalDate,
  getMealWeekDates,
  refreshMealHouseholdToday,
  selectCurrentMealWeek,
  shiftMealLocalDate,
} from '../meals/mealDates';
import {
  MEAL_TYPES,
  MEAL_TYPE_LABELS,
  selectMealPlanWeek,
} from '../meals/mealSelectors';
import {
  getHouseholdConfig,
} from '../services/householdConfigService';
import type {
  MealPlanEntry,
  MealType,
} from '../types/mealPlan';

import './Meals.css';

type Slot = {
  localDate: string;
  mealType: MealType;
};

type ActionEditor = Slot & {
  entryId: string;
  mode: 'edit' | 'move' | 'copy';
  title: string;
};

type PendingCreate = Slot & {
  id: string;
  title: string;
};

type PendingCopy = Slot & {
  id: string;
  sourceEntryId: string;
  title: string;
};

function dayLabel(localDate: string): string {
  return formatMealLocalDate(localDate, {
    weekday: 'long',
  });
}

function shortDateLabel(localDate: string): string {
  return formatMealLocalDate(localDate, {
    day: 'numeric',
    month: 'short',
  });
}

function destinationLabel(
  localDate: string,
  mealType: MealType
): string {
  return `${dayLabel(localDate)} ${MEAL_TYPE_LABELS[mealType]}`;
}

function Meals() {
  const timeZone =
    getHouseholdConfig().location.timezone;
  const [calendar, setCalendar] = useState(
    () => createMealCalendarState(
      new Date(),
      timeZone
    )
  );
  const {
    entries,
    loading,
    saving,
    error,
    refresh,
    createMeal,
    updateMeal,
    removeMeal,
  } = useMeals(calendar.selectedWeekStart);
  const [addingSlot, setAddingSlot] =
    useState<Slot | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [actionEditor, setActionEditor] =
    useState<ActionEditor | null>(null);
  const [statusMessage, setStatusMessage] =
    useState('');
  const pendingCreateRef =
    useRef<PendingCreate | null>(null);
  const pendingCopyRef =
    useRef<PendingCopy | null>(null);

  useEffect(() => {
    const updateToday = () => {
      setCalendar(current =>
        refreshMealHouseholdToday(
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
    const interval = window.setInterval(
      updateToday,
      60_000
    );

    window.addEventListener('focus', updateToday);
    document.addEventListener(
      'visibilitychange',
      handleVisibility
    );

    return () => {
      window.clearInterval(interval);
      window.removeEventListener(
        'focus',
        updateToday
      );
      document.removeEventListener(
        'visibilitychange',
        handleVisibility
      );
    };
  }, [timeZone]);

  const weekDays = useMemo(
    () => selectMealPlanWeek(
      entries,
      calendar.selectedWeekStart,
      calendar.householdToday
    ),
    [
      entries,
      calendar.selectedWeekStart,
      calendar.householdToday,
    ]
  );
  const weekDates = useMemo(
    () => getMealWeekDates(
      calendar.selectedWeekStart
    ),
    [calendar.selectedWeekStart]
  );
  const weekEnd = weekDates[6];
  const weekRange = `${formatMealLocalDate(
    calendar.selectedWeekStart,
    { day: 'numeric', month: 'short' }
  )} – ${formatMealLocalDate(weekEnd, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;

  const startAdd = (slot: Slot) => {
    setActionEditor(null);
    setAddingSlot(slot);
    setNewTitle('');
    pendingCreateRef.current = null;
  };

  const resetEditors = () => {
    setAddingSlot(null);
    setNewTitle('');
    setActionEditor(null);
    pendingCreateRef.current = null;
    pendingCopyRef.current = null;
  };

  const navigateWeek = (days: -7 | 7) => {
    resetEditors();
    setCalendar(current => ({
      ...current,
      selectedWeekStart: shiftMealLocalDate(
        current.selectedWeekStart,
        days
      ),
    }));
  };

  const navigateToToday = () => {
    resetEditors();
    setCalendar(current =>
      selectCurrentMealWeek(
        refreshMealHouseholdToday(
          current,
          new Date(),
          timeZone
        )
      )
    );
  };

  const submitAdd = async (event: FormEvent) => {
    event.preventDefault();

    if (!addingSlot || !newTitle.trim() || saving) {
      return;
    }

    const title = newTitle.trim();
    const pending = pendingCreateRef.current;
    const request = pending &&
      pending.localDate === addingSlot.localDate &&
      pending.mealType === addingSlot.mealType &&
      pending.title === title
      ? pending
      : {
        id: crypto.randomUUID(),
        ...addingSlot,
        title,
      };
    pendingCreateRef.current = request;

    try {
      await createMeal(request);
      pendingCreateRef.current = null;
      setAddingSlot(null);
      setNewTitle('');
      setStatusMessage(
        `${title} added to ${destinationLabel(
          request.localDate,
          request.mealType
        )}.`
      );
    } catch {
      // Keep the UUID and form values for an idempotent retry.
    }
  };

  const beginAction = (
    entry: MealPlanEntry,
    mode: ActionEditor['mode']
  ) => {
    setAddingSlot(null);
    setActionEditor({
      entryId: entry.id,
      mode,
      title: entry.title,
      localDate: entry.localDate,
      mealType: entry.mealType,
    });
    pendingCopyRef.current = null;
  };

  const submitAction = async (event: FormEvent) => {
    event.preventDefault();

    if (!actionEditor || saving) return;
    const entry = entries.find(
      candidate =>
        candidate.id === actionEditor.entryId
    );

    if (!entry) return;

    try {
      if (actionEditor.mode === 'edit') {
        if (!actionEditor.title.trim()) return;
        await updateMeal(entry.id, {
          title: actionEditor.title,
        });
        setStatusMessage('Meal title updated.');
      } else if (actionEditor.mode === 'move') {
        await updateMeal(entry.id, {
          localDate: actionEditor.localDate,
          mealType: actionEditor.mealType,
        });
        setStatusMessage(
          `${entry.title} moved to ${destinationLabel(
            actionEditor.localDate,
            actionEditor.mealType
          )}.`
        );
      } else {
        const pending = pendingCopyRef.current;
        const request = pending &&
          pending.sourceEntryId === entry.id &&
          pending.title === entry.title &&
          pending.localDate === actionEditor.localDate &&
          pending.mealType === actionEditor.mealType
          ? pending
          : {
            id: crypto.randomUUID(),
            sourceEntryId: entry.id,
            title: entry.title,
            localDate: actionEditor.localDate,
            mealType: actionEditor.mealType,
          };
        pendingCopyRef.current = request;
        await createMeal({
          id: request.id,
          title: request.title,
          localDate: request.localDate,
          mealType: request.mealType,
        });
        pendingCopyRef.current = null;
        setStatusMessage(
          `${entry.title} copied to ${destinationLabel(
            request.localDate,
            request.mealType
          )}.`
        );
      }

      setActionEditor(null);
    } catch {
      // The shared error banner reports the failure.
    }
  };

  const confirmRemove = (entry: MealPlanEntry) => {
    if (!window.confirm(
      `Remove ${entry.title} from ${destinationLabel(
        entry.localDate,
        entry.mealType
      )}?`
    )) {
      return;
    }

    void removeMeal(entry.id)
      .then(() => {
        if (actionEditor?.entryId === entry.id) {
          setActionEditor(null);
        }
        setStatusMessage(`${entry.title} removed.`);
      })
      .catch(() => undefined);
  };

  const renderActionEditor = (
    entry: MealPlanEntry
  ) => {
    if (actionEditor?.entryId !== entry.id) {
      return null;
    }

    const isEdit = actionEditor.mode === 'edit';

    return (
      <form
        className="meals-editor"
        onSubmit={submitAction}
      >
        {isEdit ? (
          <>
            <label htmlFor={`meal-title-${entry.id}`}>
              Edit meal title
            </label>
            <input
              id={`meal-title-${entry.id}`}
              value={actionEditor.title}
              maxLength={160}
              autoFocus
              disabled={saving}
              onChange={event =>
                setActionEditor(current =>
                  current
                    ? {
                      ...current,
                      title: event.target.value,
                    }
                    : null
                )
              }
            />
          </>
        ) : (
          <>
            <label htmlFor={`meal-day-${entry.id}`}>
              {actionEditor.mode === 'move'
                ? 'Move to day'
                : 'Copy to day'}
            </label>
            <select
              id={`meal-day-${entry.id}`}
              value={actionEditor.localDate}
              disabled={saving}
              onChange={event => {
                pendingCopyRef.current = null;
                setActionEditor(current =>
                  current
                    ? {
                      ...current,
                      localDate: event.target.value,
                    }
                    : null
                );
              }}
            >
              {weekDates.map(localDate => (
                <option
                  key={localDate}
                  value={localDate}
                >
                  {dayLabel(localDate)} · {shortDateLabel(localDate)}
                </option>
              ))}
            </select>

            <label htmlFor={`meal-type-${entry.id}`}>
              Meal type
            </label>
            <select
              id={`meal-type-${entry.id}`}
              value={actionEditor.mealType}
              disabled={saving}
              onChange={event => {
                pendingCopyRef.current = null;
                setActionEditor(current =>
                  current
                    ? {
                      ...current,
                      mealType:
                        event.target.value as MealType,
                    }
                    : null
                );
              }}
            >
              {MEAL_TYPES.map(mealType => (
                <option
                  key={mealType}
                  value={mealType}
                >
                  {MEAL_TYPE_LABELS[mealType]}
                </option>
              ))}
            </select>
          </>
        )}

        <div className="meals-editor__actions">
          <button
            type="submit"
            className="meals-button meals-button--primary"
            disabled={
              saving ||
              (isEdit && !actionEditor.title.trim())
            }
          >
            <Check size={18} aria-hidden="true" />
            {actionEditor.mode === 'edit'
              ? 'Save'
              : actionEditor.mode === 'move'
                ? 'Move'
                : 'Copy'}
          </button>
          <button
            type="button"
            className="meals-button meals-button--secondary"
            disabled={saving}
            onClick={() => {
              setActionEditor(null);
              pendingCopyRef.current = null;
            }}
          >
            <X size={18} aria-hidden="true" /> Cancel
          </button>
        </div>
      </form>
    );
  };

  return (
    <main className="meals-page">
      <header className="meals-page__header">
        <div>
          <p className="meals-page__eyebrow">
            Weekly meal planner
          </p>
          <h1>Meals</h1>
          <p>
            Keep the household meal plan clear for the week.
          </p>
        </div>
        <Utensils size={34} aria-hidden="true" />
      </header>

      <section
        className="meals-week-toolbar"
        aria-label="Meal planning week"
      >
        <div>
          <p className="meals-week-toolbar__label">
            Selected week
          </p>
          <h2>{weekRange}</h2>
        </div>
        <div className="meals-week-toolbar__actions">
          <button
            type="button"
            className="meals-button meals-button--secondary"
            disabled={saving}
            onClick={() => navigateWeek(-7)}
          >
            <ChevronLeft size={18} aria-hidden="true" />
            Previous
          </button>
          <button
            type="button"
            className="meals-button meals-button--primary"
            disabled={saving}
            onClick={navigateToToday}
          >
            Today
          </button>
          <button
            type="button"
            className="meals-button meals-button--secondary"
            disabled={saving}
            onClick={() => navigateWeek(7)}
          >
            Next
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </section>

      {error && (
        <div
          className="meals-message meals-message--error"
          role="alert"
        >
          <span>{error}</span>
          <button
            type="button"
            className="meals-button meals-button--secondary"
            disabled={loading}
            onClick={() => void refresh()}
          >
            <RefreshCw size={18} aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      <p
        className="meals-sr-status"
        role="status"
        aria-live="polite"
      >
        {statusMessage}
      </p>

      {loading ? (
        <section
          className="meals-loading"
          aria-busy="true"
        >
          Loading Meals…
        </section>
      ) : (
        <section
          className="meals-week"
          aria-label={`Meals for ${weekRange}`}
        >
          {weekDays.map(day => (
            <article
              key={day.localDate}
              className={`meals-day ${
                day.isToday
                  ? 'meals-day--today'
                  : ''
              }`}
            >
              <header className="meals-day__header">
                <div>
                  <h3>{dayLabel(day.localDate)}</h3>
                  <p>{shortDateLabel(day.localDate)}</p>
                </div>
                {day.isToday && (
                  <span className="meals-day__today">
                    Today
                  </span>
                )}
              </header>

              <div className="meals-day__slots">
                {MEAL_TYPES.map(mealType => {
                  const slotEntries =
                    day.entries[mealType];
                  const slot = {
                    localDate: day.localDate,
                    mealType,
                  };
                  const isAdding =
                    addingSlot?.localDate === day.localDate &&
                    addingSlot.mealType === mealType;

                  return (
                    <section
                      key={mealType}
                      className="meals-slot"
                      aria-labelledby={`${day.localDate}-${mealType}`}
                    >
                      <div className="meals-slot__header">
                        <h4 id={`${day.localDate}-${mealType}`}>
                          {MEAL_TYPE_LABELS[mealType]}
                        </h4>
                        <button
                          type="button"
                          className="meals-icon-button"
                          disabled={saving}
                          onClick={() => startAdd(slot)}
                          aria-label={`Add ${MEAL_TYPE_LABELS[mealType]} for ${dayLabel(day.localDate)}`}
                        >
                          <Plus size={18} aria-hidden="true" />
                        </button>
                      </div>

                      {slotEntries.length > 0 ? (
                        <ul className="meals-entries">
                          {slotEntries.map(entry => (
                            <li
                              key={entry.id}
                              className="meals-entry"
                            >
                              <div className="meals-entry__row">
                                <span className="meals-entry__title">
                                  {entry.title}
                                </span>
                                <details className="meals-entry__actions">
                                  <summary
                                    aria-label={`Actions for ${entry.title}`}
                                  >
                                    <MoreHorizontal
                                      size={20}
                                      aria-hidden="true"
                                    />
                                  </summary>
                                  <div className="meals-entry__action-list">
                                    <button
                                      type="button"
                                      disabled={saving}
                                      onClick={() => beginAction(entry, 'edit')}
                                    >
                                      <Pencil size={17} aria-hidden="true" />
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      disabled={saving}
                                      onClick={() => beginAction(entry, 'move')}
                                    >
                                      <ChevronRight size={17} aria-hidden="true" />
                                      Move
                                    </button>
                                    <button
                                      type="button"
                                      disabled={saving}
                                      onClick={() => beginAction(entry, 'copy')}
                                    >
                                      <Copy size={17} aria-hidden="true" />
                                      Copy
                                    </button>
                                    <button
                                      type="button"
                                      className="is-danger"
                                      disabled={saving}
                                      onClick={() => confirmRemove(entry)}
                                    >
                                      <Trash2 size={17} aria-hidden="true" />
                                      Remove
                                    </button>
                                  </div>
                                </details>
                              </div>
                              {renderActionEditor(entry)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="meals-slot__empty">
                          Nothing planned.
                        </p>
                      )}

                      {isAdding && (
                        <form
                          className="meals-editor meals-editor--add"
                          onSubmit={submitAdd}
                        >
                          <label
                            className="meals-sr-only"
                            htmlFor={`add-meal-${day.localDate}-${mealType}`}
                          >
                            Add {MEAL_TYPE_LABELS[mealType]} for {dayLabel(day.localDate)}
                          </label>
                          <input
                            id={`add-meal-${day.localDate}-${mealType}`}
                            value={newTitle}
                            maxLength={160}
                            placeholder="Meal title"
                            autoFocus
                            disabled={saving}
                            onChange={event => {
                              setNewTitle(event.target.value);
                              if (
                                pendingCreateRef.current?.title !==
                                  event.target.value.trim()
                              ) {
                                pendingCreateRef.current = null;
                              }
                            }}
                          />
                          <div className="meals-editor__actions">
                            <button
                              type="submit"
                              className="meals-button meals-button--primary"
                              disabled={saving || !newTitle.trim()}
                            >
                              <Check size={18} aria-hidden="true" />
                              Add
                            </button>
                            <button
                              type="button"
                              className="meals-button meals-button--secondary"
                              disabled={saving}
                              onClick={() => {
                                setAddingSlot(null);
                                setNewTitle('');
                                pendingCreateRef.current = null;
                              }}
                            >
                              <X size={18} aria-hidden="true" />
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}
                    </section>
                  );
                })}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

export default Meals;
