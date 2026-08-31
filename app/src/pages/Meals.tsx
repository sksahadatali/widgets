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
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useMeals } from '../hooks/useMeals';
import {
  createMealCalendarState,
  formatMealLocalDate,
  refreshMealHouseholdToday,
  selectCurrentMealWindow,
  shiftMealLocalDate,
} from '../meals/mealDates';
import {
  MEAL_TYPES,
  MEAL_TYPE_LABELS,
  selectMealActionDates,
  selectMealPlanWindow,
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

type ActionDialogState = Slot & {
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

type MealDialogProps = {
  busy: boolean;
  children: ReactNode;
  onClose: () => void;
  title: string;
};

function MealDialog({
  busy,
  children,
  onClose,
  title,
}: MealDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;

    if (dialog && !dialog.open) {
      dialog.showModal();
    }

    return () => {
      if (dialog?.open) {
        dialog.close();
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="meals-dialog"
      aria-labelledby={titleId}
      onCancel={event => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="meals-dialog__surface">
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

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
  } = useMeals(calendar.selectedWindowStart);
  const [addingSlot, setAddingSlot] =
    useState<Slot | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [actionEditor, setActionEditor] =
    useState<ActionDialogState | null>(null);
  const [removeEntryId, setRemoveEntryId] =
    useState<string | null>(null);
  const [openActionMenuId, setOpenActionMenuId] =
    useState<string | null>(null);
  const [statusMessage, setStatusMessage] =
    useState('');
  const actionMenuRef =
    useRef<HTMLDivElement | null>(null);
  const actionMenuTriggerRef =
    useRef<HTMLButtonElement | null>(null);
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

  useEffect(() => {
    if (!openActionMenuId) return;

    const closeForOutsideInteraction = (
      event: PointerEvent
    ) => {
      const target = event.target;

      if (
        target instanceof Node &&
        !actionMenuRef.current?.contains(target)
      ) {
        setOpenActionMenuId(null);
      }
    };
    const closeForEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      event.preventDefault();
      setOpenActionMenuId(null);
      actionMenuTriggerRef.current?.focus();
    };

    document.addEventListener(
      'pointerdown',
      closeForOutsideInteraction
    );
    document.addEventListener(
      'keydown',
      closeForEscape
    );

    return () => {
      document.removeEventListener(
        'pointerdown',
        closeForOutsideInteraction
      );
      document.removeEventListener(
        'keydown',
        closeForEscape
      );
    };
  }, [openActionMenuId]);

  const windowDays = useMemo(
    () => selectMealPlanWindow(
      entries,
      calendar.selectedWindowStart,
      calendar.householdToday
    ),
    [
      entries,
      calendar.selectedWindowStart,
      calendar.householdToday,
    ]
  );
  const windowDates = useMemo(
    () => selectMealActionDates(
      calendar.selectedWindowStart
    ),
    [calendar.selectedWindowStart]
  );
  const windowEnd = windowDates[6];
  const windowRange = `${formatMealLocalDate(
    calendar.selectedWindowStart,
    { day: 'numeric', month: 'short' }
  )} – ${formatMealLocalDate(windowEnd, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
  const actionEntry = actionEditor
    ? entries.find(
      entry => entry.id === actionEditor.entryId
    )
    : undefined;
  const removeEntry = removeEntryId
    ? entries.find(entry => entry.id === removeEntryId)
    : undefined;

  const startAdd = (slot: Slot) => {
    setActionEditor(null);
    setRemoveEntryId(null);
    setOpenActionMenuId(null);
    setAddingSlot(slot);
    setNewTitle('');
    pendingCreateRef.current = null;
  };

  const resetEditors = () => {
    setAddingSlot(null);
    setNewTitle('');
    setActionEditor(null);
    setRemoveEntryId(null);
    setOpenActionMenuId(null);
    pendingCreateRef.current = null;
    pendingCopyRef.current = null;
  };

  const navigateWindow = (days: -7 | 7) => {
    resetEditors();
    setCalendar(current => ({
      ...current,
      selectedWindowStart: shiftMealLocalDate(
        current.selectedWindowStart,
        days
      ),
    }));
  };

  const navigateToToday = () => {
    resetEditors();
    setCalendar(current =>
      selectCurrentMealWindow(
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
    mode: ActionDialogState['mode']
  ) => {
    setOpenActionMenuId(null);
    setAddingSlot(null);
    setRemoveEntryId(null);
    setActionEditor({
      entryId: entry.id,
      mode,
      title: entry.title,
      localDate: entry.localDate,
      mealType: entry.mealType,
    });
    pendingCopyRef.current = null;
  };

  const beginRemove = (entry: MealPlanEntry) => {
    setOpenActionMenuId(null);
    setAddingSlot(null);
    setActionEditor(null);
    setRemoveEntryId(entry.id);
    pendingCopyRef.current = null;
  };

  const closeActionDialog = () => {
    setActionEditor(null);
    setRemoveEntryId(null);
    pendingCopyRef.current = null;

    window.requestAnimationFrame(() => {
      const trigger = actionMenuTriggerRef.current;
      if (trigger?.isConnected) trigger.focus();
    });
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

      closeActionDialog();
    } catch {
      // The shared error banner reports the failure.
    }
  };

  const submitRemove = async (event: FormEvent) => {
    event.preventDefault();

    if (!removeEntry || saving) return;

    try {
      await removeMeal(removeEntry.id);
      setStatusMessage(`${removeEntry.title} removed.`);
      closeActionDialog();
    } catch {
      // The shared error banner reports the failure.
    }
  };

  return (
    <main className="meals-page">
      <header className="meals-page__header">
        <div>
          <p className="meals-page__eyebrow">
            Seven-day meal planner
          </p>
          <h1>Meals</h1>
          <p>
            Keep the next seven days of household meals clear.
          </p>
        </div>
        <Utensils size={34} aria-hidden="true" />
      </header>

      <section
        className="meals-window-toolbar"
        aria-label="Meal planning window"
      >
        <h2>{windowRange}</h2>
        <div className="meals-window-toolbar__actions">
          <button
            type="button"
            className="meals-button meals-button--secondary"
            disabled={saving}
            onClick={() => navigateWindow(-7)}
          >
            <ChevronLeft size={18} aria-hidden="true" />
            Previous 7 days
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
            onClick={() => navigateWindow(7)}
          >
            Next 7 days
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
          className="meals-window"
          aria-label={`Meals for ${windowRange}`}
        >
          <div
            className="meals-window__headings"
            aria-hidden="true"
          >
            <span>Day</span>
            {MEAL_TYPES.map(mealType => (
              <span key={mealType}>
                {MEAL_TYPE_LABELS[mealType]}
              </span>
            ))}
          </div>

          {windowDays.map(day => (
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
                      <div
                        className={`meals-slot__header ${
                          slotEntries.length === 0
                            ? 'meals-slot__header--empty'
                            : ''
                        }`}
                      >
                        <h4
                          className="meals-sr-only"
                          id={`${day.localDate}-${mealType}`}
                        >
                          {MEAL_TYPE_LABELS[mealType]}
                        </h4>
                        {slotEntries.length === 0 && (
                          <p className="meals-slot__empty">
                            Nothing planned.
                          </p>
                        )}
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
                                <div
                                  className="meals-entry__actions"
                                  ref={
                                    openActionMenuId === entry.id
                                      ? actionMenuRef
                                      : undefined
                                  }
                                >
                                  <button
                                    type="button"
                                    className="meals-entry__action-button"
                                    aria-label={`Actions for ${entry.title}`}
                                    aria-expanded={
                                      openActionMenuId === entry.id
                                    }
                                    aria-haspopup="menu"
                                    disabled={saving}
                                    onClick={event => {
                                      actionMenuTriggerRef.current =
                                        event.currentTarget;
                                      setOpenActionMenuId(current =>
                                        current === entry.id
                                          ? null
                                          : entry.id
                                      );
                                    }}
                                  >
                                    <MoreHorizontal
                                      size={20}
                                      aria-hidden="true"
                                    />
                                  </button>
                                  {openActionMenuId === entry.id && (
                                    <div
                                      className="meals-entry__action-list"
                                      role="menu"
                                      aria-label={`Actions for ${entry.title}`}
                                    >
                                      <button
                                        type="button"
                                        role="menuitem"
                                        disabled={saving}
                                        onClick={() => beginAction(entry, 'edit')}
                                      >
                                        <Pencil size={17} aria-hidden="true" />
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        role="menuitem"
                                        disabled={saving}
                                        onClick={() => beginAction(entry, 'move')}
                                      >
                                        <ChevronRight size={17} aria-hidden="true" />
                                        Move
                                      </button>
                                      <button
                                        type="button"
                                        role="menuitem"
                                        disabled={saving}
                                        onClick={() => beginAction(entry, 'copy')}
                                      >
                                        <Copy size={17} aria-hidden="true" />
                                        Copy
                                      </button>
                                      <button
                                        type="button"
                                        role="menuitem"
                                        className="is-danger"
                                        disabled={saving}
                                        onClick={() => beginRemove(entry)}
                                      >
                                        <Trash2 size={17} aria-hidden="true" />
                                        Remove
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : null}

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

      {actionEditor && actionEntry && (
        <MealDialog
          busy={saving}
          title={
            actionEditor.mode === 'edit'
              ? 'Edit meal'
              : actionEditor.mode === 'move'
                ? 'Move meal'
                : 'Copy meal'
          }
          onClose={closeActionDialog}
        >
          <form
            className="meals-dialog__form"
            onSubmit={submitAction}
          >
            {actionEditor.mode === 'edit' ? (
              <label className="meals-dialog__field">
                <span>Meal</span>
                <input
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
              </label>
            ) : (
              <>
                <p className="meals-dialog__meal-title">
                  {actionEntry.title}
                </p>

                <label className="meals-dialog__field">
                  <span>Day</span>
                  <select
                    value={actionEditor.localDate}
                    autoFocus
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
                    {windowDates.map(localDate => (
                      <option
                        key={localDate}
                        value={localDate}
                      >
                        {dayLabel(localDate)} · {shortDateLabel(localDate)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="meals-dialog__field">
                  <span>Meal</span>
                  <select
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
                </label>
              </>
            )}

            <div className="meals-dialog__actions">
              <button
                type="button"
                className="meals-button meals-button--secondary"
                disabled={saving}
                onClick={closeActionDialog}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="meals-button meals-button--primary"
                disabled={
                  saving ||
                  (actionEditor.mode === 'edit' &&
                    !actionEditor.title.trim())
                }
              >
                {actionEditor.mode === 'edit'
                  ? 'Save'
                  : actionEditor.mode === 'move'
                    ? 'Move'
                    : 'Copy'}
              </button>
            </div>
          </form>
        </MealDialog>
      )}

      {removeEntry && (
        <MealDialog
          busy={saving}
          title="Remove meal?"
          onClose={closeActionDialog}
        >
          <form
            className="meals-dialog__form"
            onSubmit={submitRemove}
          >
            <p className="meals-dialog__meal-title">
              {removeEntry.title}
            </p>
            <p className="meals-dialog__description">
              This will remove the meal from the plan.
            </p>
            <div className="meals-dialog__actions">
              <button
                type="button"
                className="meals-button meals-button--secondary"
                autoFocus
                disabled={saving}
                onClick={closeActionDialog}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="meals-button meals-button--danger"
                disabled={saving}
              >
                Remove
              </button>
            </div>
          </form>
        </MealDialog>
      )}
    </main>
  );
}

export default Meals;
