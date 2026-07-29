import {
  type KeyboardEvent,
  type MouseEvent,
  useMemo,
  useState,
} from 'react';

import {
  AlertCircle,
  Clock3,
  Pencil,
  Plus,
} from 'lucide-react';

import TaskEditor from '../../shared/TaskEditor/TaskEditor';

import { useDueSoon } from '../../../hooks/useDueSoon';

import type {
  DueSoonTask,
  DueState,
  SaveTaskInput,
} from '../../../types/task';

import './DueSoon.css';

const DUE_STATE_ORDER: Record<
  DueState,
  number
> = {
  overdue: 0,
  today: 1,
  tomorrow: 2,
  upcoming: 3,
};

function DueSoon() {
  const {
    tasks,
    loading,
    error,
    creating,
    editingId,
    refresh,
    addReminder,
    editReminder,
  } = useDueSoon();

  const [showAdd, setShowAdd] =
    useState(false);

  const [
    editingReminder,
    setEditingReminder,
  ] = useState<DueSoonTask | null>(
    null
  );

  const sortedReminders =
    useMemo(
      () =>
        [...tasks].sort(
          (first, second) => {
            const stateDifference =
              DUE_STATE_ORDER[
                first.dueState
              ] -
              DUE_STATE_ORDER[
                second.dueState
              ];

            if (
              stateDifference !== 0
            ) {
              return stateDifference;
            }

            return (
              new Date(
                first.dueDate
              ).getTime() -
              new Date(
                second.dueDate
              ).getTime()
            );
          }
        ),
      [tasks]
    );

  async function handleAddReminder(
    input: SaveTaskInput
  ) {
    await addReminder(input);

    setShowAdd(false);
  }

  async function handleEditReminder(
    input: SaveTaskInput
  ) {
    if (!editingReminder) {
      return;
    }

    await editReminder(
      editingReminder.id,
      input
    );

    setEditingReminder(null);
  }

  function openAddEditor() {
    setEditingReminder(null);
    setShowAdd(true);
  }

  function openEditEditor(
    reminder: DueSoonTask
  ) {
    setShowAdd(false);
    setEditingReminder(
      reminder
    );
  }

  function handleRowKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    reminder: DueSoonTask
  ) {
    if (
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();

      openEditEditor(
        reminder
      );
    }
  }

  function handleEditClick(
    event: MouseEvent<HTMLButtonElement>,
    reminder: DueSoonTask
  ) {
    event.stopPropagation();

    openEditEditor(
      reminder
    );
  }

  return (
    <section className="due-soon">
      <div className="due-soon__header">
        <div className="due-soon__heading">
          <Clock3
            size={21}
            strokeWidth={2}
            aria-hidden="true"
          />

          <h2>Due Soon</h2>
        </div>

        <div className="due-soon__header-actions">
          {!loading && !error && (
            <span className="due-soon__count">
              {tasks.length} items
            </span>
          )}

          <button
            type="button"
            className="due-soon__add-button"
            onClick={openAddEditor}
            aria-label="Add reminder"
          >
            <Plus
              size={17}
              strokeWidth={2}
              aria-hidden="true"
            />

            Add
          </button>
        </div>
      </div>

      {showAdd && (
        <TaskEditor
          mode="add"
          defaultType="Reminder"
          saving={creating}
          onCancel={() =>
            setShowAdd(false)
          }
          onSubmit={
            handleAddReminder
          }
        />
      )}

      {loading ? (
        <div className="due-soon__state">
          Loading reminders...
        </div>
      ) : error ? (
        <div className="due-soon__state due-soon__state--error">
          <span>
            Unable to load reminders
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
      ) : sortedReminders.length ===
        0 ? (
        <div className="due-soon__state">
          No active reminders.
        </div>
      ) : (
        <div className="due-soon__list">
          {sortedReminders.map(
            reminder => (
              <div
                className="due-soon__item-wrapper"
                key={reminder.id}
              >
                <div
                  className="due-soon__item"
                  role="button"
                  tabIndex={0}
                  aria-label={`Edit ${reminder.task}`}
                  onClick={() =>
                    openEditEditor(
                      reminder
                    )
                  }
                  onKeyDown={event =>
                    handleRowKeyDown(
                      event,
                      reminder
                    )
                  }
                >
                  <div
                    className={`due-soon__indicator due-soon__indicator--${reminder.dueState}`}
                  />

                  <div className="due-soon__content">
                    <span className="due-soon__task">
                      {reminder.task}
                    </span>

                    <div className="due-soon__meta">
                      <span className="due-soon__area">
                        {reminder.area}
                      </span>

                      <span
                        className={`due-soon__priority due-soon__priority--${reminder.priority.toLowerCase()}`}
                      >
                        {reminder.priority}
                      </span>
                    </div>
                  </div>

                  <div className="due-soon__item-actions">
                    <span
                      className={`due-soon__date due-soon__date--${reminder.dueState}`}
                    >
                      {reminder.dueState ===
                        'overdue' && (
                        <AlertCircle
                          size={14}
                          aria-hidden="true"
                        />
                      )}

                      {reminder.dueLabel}
                    </span>

                    <button
                      type="button"
                      className="due-soon__edit"
                      aria-label={`Edit ${reminder.task}`}
                      onClick={event =>
                        handleEditClick(
                          event,
                          reminder
                        )
                      }
                    >
                      <Pencil
                        size={14}
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </div>

                {editingReminder?.id ===
                  reminder.id && (
                  <div className="due-soon__editor">
                    <TaskEditor
                      mode="edit"
                      defaultType="Reminder"
                      initialValue={{
                        task:
                          editingReminder.task,

                        type:
                          editingReminder.type,

                        area:
                          editingReminder.area,

                        priority:
                          editingReminder.priority,

                        dueDate:
                          editingReminder.dueDate,
                      }}
                      saving={
                        editingId ===
                        reminder.id
                      }
                      onCancel={() =>
                        setEditingReminder(
                          null
                        )
                      }
                      onSubmit={
                        handleEditReminder
                      }
                    />
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}

export default DueSoon;
