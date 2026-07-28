import {
    useState,
  } from 'react';
  
  import {
    Check,
    ListTodo,
    Pencil,
    Plus,
    X,
  } from 'lucide-react';
  
  import { useTasks } from '../../../hooks/useTasks';
  
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
  
    /* -----------------------------------
       Add Task
    ----------------------------------- */
  
    const [showAdd, setShowAdd] =
      useState(false);
  
    const [taskName, setTaskName] =
      useState('');
  
    const [area, setArea] =
      useState('Personal');
  
    const [priority, setPriority] =
      useState('Medium');
  
    const [dueDate, setDueDate] =
      useState('');
  
    /* -----------------------------------
       Edit Task
    ----------------------------------- */
  
    const [editingTask, setEditingTask] =
      useState<string | null>(null);
  
    const [editName, setEditName] =
      useState('');
  
    const [editType, setEditType] =
      useState<
        'Task' | 'Reminder'
      >('Task');
  
    const [editArea, setEditArea] =
      useState('Personal');
  
    const [
      editPriority,
      setEditPriority,
    ] = useState('Medium');
  
    const [
      editDueDate,
      setEditDueDate,
    ] = useState('');
  
    async function handleAddTask() {
      if (!taskName.trim()) {
        return;
      }
  
      await addTask({
        task: taskName.trim(),
        area,
        priority,
        dueDate:
          dueDate || null,
      });
  
      setTaskName('');
      setArea('Personal');
      setPriority('Medium');
      setDueDate('');
      setShowAdd(false);
    }
  
    function startEditing(
      task: typeof tasks[number]
    ) {
      setEditingTask(task.id);
  
      setEditName(
        task.task
      );
  
      setEditType(
        task.type === 'Reminder'
          ? 'Reminder'
          : 'Task'
      );
  
      setEditArea(
        task.area
      );
  
      setEditPriority(
        task.priority
      );
  
      setEditDueDate(
        task.dueDate ?? ''
      );
    }
  
    async function handleSaveEdit() {
      if (
        !editingTask ||
        !editName.trim()
      ) {
        return;
      }
  
      await editTask(
        editingTask,
        {
          task: editName.trim(),
          type: editType,
          area: editArea,
          priority:
            editPriority,
          dueDate:
            editDueDate || null,
        }
      );
  
      setEditingTask(null);
    }
  
    return (
      <section className="tasks">
        {/* Header */}
  
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
              onClick={() =>
                setShowAdd(true)
              }
              aria-label="Add task"
            >
              <Plus
                size={17}
                strokeWidth={2}
              />
              Add
            </button>
          </div>
        </div>
  
        {/* Add Task Form */}
  
        {showAdd && (
          <div className="tasks__add-form">
            <div className="tasks__add-form-header">
              <strong>
                New Task
              </strong>
  
              <button
                type="button"
                className="tasks__close"
                onClick={() =>
                  setShowAdd(false)
                }
                aria-label="Close"
              >
                <X
                  size={17}
                  strokeWidth={2}
                />
              </button>
            </div>
  
            <input
              className="tasks__name-input"
              type="text"
              value={taskName}
              placeholder="What needs to be done?"
              onChange={event =>
                setTaskName(
                  event.target.value
                )
              }
            />
  
            <div className="tasks__form-row">
              <select
                value={area}
                onChange={event =>
                  setArea(
                    event.target.value
                  )
                }
              >
                <option>
                  Personal
                </option>
  
                <option>
                  Family
                </option>
  
                <option>
                  Home
                </option>
  
                <option>
                  Car
                </option>
  
                <option>
                  RAEN
                </option>
  
                <option>
                  AYANOH
                </option>
  
                <option>
                  Work
                </option>
              </select>
  
              <select
                value={priority}
                onChange={event =>
                  setPriority(
                    event.target.value
                  )
                }
              >
                <option>
                  High
                </option>
  
                <option>
                  Medium
                </option>
  
                <option>
                  Low
                </option>
              </select>
  
              <input
                type="date"
                value={dueDate}
                onChange={event =>
                  setDueDate(
                    event.target.value
                  )
                }
              />
            </div>
  
            <button
              type="button"
              className="tasks__save"
              disabled={
                !taskName.trim() ||
                creating
              }
              onClick={() => {
                void handleAddTask();
              }}
            >
              {creating
                ? 'Adding...'
                : 'Add Task'}
            </button>
          </div>
        )}
  
        {/* Loading */}
  
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
                  <div className="tasks__item">
                    {/* Complete */}
  
                    <button
                      type="button"
                      className="tasks__complete"
                      disabled={
                        updatingId ===
                        task.id
                      }
                      aria-label={`Mark ${task.task} as done`}
                      onClick={() => {
                        void completeTask(
                          task.id
                        );
                      }}
                    >
                      <Check
                        size={15}
                        strokeWidth={2}
                      />
                    </button>
  
                    {/* Content */}
  
                    <div className="tasks__content">
                      <span className="tasks__title">
                        {task.task}
                      </span>
  
                      <span className="tasks__meta">
                        {task.area}
                        {' · '}
                        {task.priority}
                      </span>
                    </div>
  
                    {/* Right side */}
  
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
                        onClick={() =>
                          startEditing(
                            task
                          )
                        }
                      >
                        <Pencil
                          size={14}
                          strokeWidth={2}
                        />
                      </button>
                    </div>
                  </div>
  
                  {/* Edit Form */}
  
                  {editingTask ===
                    task.id && (
                    <div className="tasks__edit-form">
                      <input
                        type="text"
                        value={
                          editName
                        }
                        onChange={event =>
                          setEditName(
                            event
                              .target
                              .value
                          )
                        }
                      />
  
                      <div className="tasks__edit-form-row">
                        <select
                          value={
                            editType
                          }
                          onChange={event =>
                            setEditType(
                              event
                                .target
                                .value as
                                | 'Task'
                                | 'Reminder'
                            )
                          }
                        >
                          <option>
                            Task
                          </option>
  
                          <option>
                            Reminder
                          </option>
                        </select>
  
                        <select
                          value={
                            editArea
                          }
                          onChange={event =>
                            setEditArea(
                              event
                                .target
                                .value
                            )
                          }
                        >
                          <option>
                            Personal
                          </option>
  
                          <option>
                            Family
                          </option>
  
                          <option>
                            Home
                          </option>
  
                          <option>
                            Car
                          </option>
  
                          <option>
                            RAEN
                          </option>
  
                          <option>
                            AYANOH
                          </option>
  
                          <option>
                            Work
                          </option>
                        </select>
  
                        <select
                          value={
                            editPriority
                          }
                          onChange={event =>
                            setEditPriority(
                              event
                                .target
                                .value
                            )
                          }
                        >
                          <option>
                            High
                          </option>
  
                          <option>
                            Medium
                          </option>
  
                          <option>
                            Low
                          </option>
                        </select>
  
                        <input
                          type="date"
                          value={
                            editDueDate
                          }
                          onChange={event =>
                            setEditDueDate(
                              event
                                .target
                                .value
                            )
                          }
                        />
                      </div>
  
                      <div className="tasks__edit-actions">
                        <button
                          type="button"
                          className="tasks__cancel"
                          onClick={() =>
                            setEditingTask(
                              null
                            )
                          }
                        >
                          Cancel
                        </button>
  
                        <button
                          type="button"
                          className="tasks__save"
                          disabled={
                            !editName.trim() ||
                            editingId ===
                              task.id
                          }
                          onClick={() => {
                            void handleSaveEdit();
                          }}
                        >
                          {editingId ===
                          task.id
                            ? 'Saving...'
                            : 'Save'}
                        </button>
                      </div>
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