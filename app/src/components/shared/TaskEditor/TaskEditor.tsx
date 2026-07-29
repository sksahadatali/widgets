import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { TASK_AREAS, TASK_PRIORITIES, TASK_TYPES } from '../../../constants/taskOptions';
import type { SaveTaskInput, TaskArea, TaskPriority, TaskType } from '../../../types/task';
import './TaskEditor.css';

type Props = {
  mode: 'add' | 'edit';
  defaultType: TaskType;
  initialValue?: SaveTaskInput;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (input: SaveTaskInput) => Promise<void>;
};

function TaskEditor({ mode, defaultType, initialValue, saving, onCancel, onSubmit }: Props) {
  const [task, setTask] = useState('');
  const [type, setType] = useState<TaskType>(defaultType);
  const [area, setArea] = useState<TaskArea>('Personal');
  const [priority, setPriority] = useState<TaskPriority>('Medium');
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    setTask(initialValue?.task ?? '');
    setType(initialValue?.type ?? defaultType);
    setArea(initialValue?.area ?? 'Personal');
    setPriority(initialValue?.priority ?? 'Medium');
    setDueDate(initialValue?.dueDate ?? '');
  }, [defaultType, initialValue]);

  const requiresDueDate = type === 'Reminder';
  const canSave = useMemo(
    () => task.trim().length > 0 && (!requiresDueDate || dueDate.length > 0),
    [task, requiresDueDate, dueDate]
  );

  async function handleSubmit() {
    if (!canSave || saving) return;
    await onSubmit({ task: task.trim(), type, area, priority, dueDate: dueDate || null });
  }

  return (
    <div className="task-editor">
      <div className="task-editor__header">
        <strong>{mode === 'add' ? `New ${defaultType}` : `Edit ${initialValue?.type ?? defaultType}`}</strong>
        <button type="button" className="task-editor__close" onClick={onCancel} aria-label="Close editor">
          <X size={17} strokeWidth={2} />
        </button>
      </div>

      <input
        className="task-editor__name"
        type="text"
        value={task}
        placeholder={type === 'Reminder' ? 'What should be remembered?' : 'What needs to be done?'}
        onChange={event => setTask(event.target.value)}
      />

      <div className="task-editor__fields">
        <select value={type} onChange={event => setType(event.target.value as TaskType)} aria-label="Type">
          {TASK_TYPES.map(option => <option key={option}>{option}</option>)}
        </select>
        <select value={area} onChange={event => setArea(event.target.value as TaskArea)} aria-label="Area">
          {TASK_AREAS.map(option => <option key={option}>{option}</option>)}
        </select>
        <select value={priority} onChange={event => setPriority(event.target.value as TaskPriority)} aria-label="Priority">
          {TASK_PRIORITIES.map(option => <option key={option}>{option}</option>)}
        </select>
        <input type="date" value={dueDate} required={requiresDueDate} onChange={event => setDueDate(event.target.value)} aria-label="Due date" />
      </div>

      {requiresDueDate && !dueDate && <span className="task-editor__hint">A due date is required for reminders.</span>}

      <div className="task-editor__actions">
        <button type="button" className="task-editor__cancel" onClick={onCancel}>Cancel</button>
        <button type="button" className="task-editor__save" disabled={!canSave || saving} onClick={() => void handleSubmit()}>
          {saving ? 'Saving...' : mode === 'add' ? `Add ${type}` : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default TaskEditor;
