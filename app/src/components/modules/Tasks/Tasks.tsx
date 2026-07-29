import {
  type KeyboardEvent,
  type MouseEvent,
  useState,
} from 'react';

import {
  Check,
  ListTodo,
  Pencil,
  Plus,
} from 'lucide-react';

import TaskEditor from '../../shared/TaskEditor/TaskEditor';

import { useTasks } from '../../../hooks/useTasks';

import type {
  SaveTaskInput,
  TaskItem,
} from '../../../types/task';

import './Tasks.css';

function Tasks() {
  const {
    tasks,
    loading,
    error,
    updatingId,
    creating,
    editingId,
    refresh,
    completeTask,
    addTask,
    editTask,
  } = useTasks();

  const [showAdd, setShowAdd] =
    useState(false);

  const [
    editingTask,
    setEditingTask,
  ] = useState<TaskItem | null>(
    null
  );

  async function handleAddTask(
    input: SaveTaskInput
  ) {
    await addTask(input);
    setShowAdd(false);
  }

  async function handleEditTask(
    input: SaveTaskInput
  ) {
    if (!editingTask) {
      return;
    }

    await editTask(
      editingTask.id,
      input
    );

    setEditingTask(null);
  }

  function openAddEditor() {
    setEditingTask(null);
    setShowAdd(true);
  }

  function openEditEditor(
    task: TaskItem
  ) {
    setShowAdd(false);
    setEditingTask(task);
  }

  function handleRowKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    task: TaskItem
  ) {
    if (
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      openEditEditor(task);
    }
  }

  function handleComplete(
    event: MouseEvent<HTMLButtonElement>,
    taskId: string
  ) {
    event.stopPropagation();

    void completeTask(taskId);
  }

  function handleEditClick(
    event: MouseEvent<HTMLButtonElement>,
    task: TaskItem
  ) {
    event.stopPropagation();
    openEditEditor(task);
  }

  return (
    <section className="tasks">
      <div className="tasks__header">
        <div className="tasks__heading">
          <ListTodo
            size={21}
            strokeWidth={2}
            aria-hidden="true"
          />

          <h2>Tasks</h2>
        </div>

        <div className="tasks__header-actions">
          {!loading && !error && (
            <span className="tasks__count">
              {tasks.length} active
            </span>
          )}

          <button
            type="button"
            className="tasks__add-button"
            onClick={openAddEditor}
            aria-label="Add task"
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
          defaultType="Task"
          saving={creating}
          onCancel={() =>
            setShowAdd(false)
          }
          onSubmit={
            handleAddTask
          }
        />
      )}

      {loading ? (
        <div className="tasks__state">
          Loading tasks...
        </div>
      ) : error ? (
        <div className="tasks__state tasks__state--error">
          <span>
            Unable to load tasks
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
      ) : tasks.length === 0 ? (
        <div className="tasks__state">
          No active tasks.
        </div>
      ) : (
        <div className="tasks__list">
          {tasks
            .slice(0, 6)
            .map(task => (
              <div
                className="tasks__task-wrapper"
                key={task.id}
              >
                <div
                  className="tasks__item"
                  role="button"
                  tabIndex={0}
                  aria-label={`Edit ${task.task}`}
                  onClick={() =>
                    openEditEditor(task)
                  }
                  onKeyDown={event =>
                    handleRowKeyDown(
                      event,
                      task
                    )
                  }
                >
                  <button
                    type="button"
                    className="tasks__complete"
                    disabled={
                      updatingId ===
                      task.id
                    }
                    aria-label={`Mark ${task.task} as done`}
                    onClick={event =>
                      handleComplete(
                        event,
                        task.id
                      )
                    }
                  >
                    <Check
                      size={15}
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                  </button>

                  <div className="tasks__content">
                    <span className="tasks__title">
                      {task.task}
                    </span>

                    <div className="tasks__meta">
                      <span>
                        {task.area}
                      </span>

                      <span
                        className={`tasks__priority tasks__priority--${task.priority.toLowerCase()}`}
                      >
                        {task.priority}
                      </span>
                    </div>
                  </div>

                  <div className="tasks__item-actions">
                    {task.dueLabel && (
                      <span
                        className={`tasks__due ${
                          task.dueState
                            ? `tasks__due--${task.dueState}`
                            : ''
                        }`}
                      >
                        {task.dueLabel}
                      </span>
                    )}

                    <button
                      type="button"
                      className="tasks__edit"
                      aria-label={`Edit ${task.task}`}
                      onClick={event =>
                        handleEditClick(
                          event,
                          task
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

                {editingTask?.id ===
                  task.id && (
                  <div className="tasks__editor">
                    <TaskEditor
                      mode="edit"
                      defaultType="Task"
                      initialValue={{
                        task:
                          editingTask.task,
                        type:
                          editingTask.type,
                        area:
                          editingTask.area,
                        priority:
                          editingTask.priority,
                        dueDate:
                          editingTask.dueDate,
                      }}
                      saving={
                        editingId ===
                        task.id
                      }
                      onCancel={() =>
                        setEditingTask(
                          null
                        )
                      }
                      onSubmit={
                        handleEditTask
                      }
                    />
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </section>
  );
}

export default Tasks;