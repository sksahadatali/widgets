export type TaskType = 'Task' | 'Reminder';
export type TaskArea = 'Personal' | 'Family' | 'Home' | 'Car' | 'RAEN' | 'AYANOH' | 'Work';
export type TaskPriority = 'High' | 'Medium' | 'Low';
export type DueState = 'overdue' | 'today' | 'tomorrow' | 'upcoming';

export type TaskItem = {
  id: string;
  task: string;
  type: TaskType;
  area: TaskArea;
  priority: TaskPriority;
  dueDate: string | null;
  dueLabel: string | null;
  dueState: DueState | null;
  status: string;
  link: string | null;
};

export type DueSoonTask = Omit<TaskItem, 'type' | 'dueDate' | 'dueLabel' | 'dueState'> & {
  type: 'Reminder';
  dueDate: string;
  dueLabel: string;
  dueState: DueState;
};

export type SaveTaskInput = {
  task: string;
  type: TaskType;
  area: TaskArea;
  priority: TaskPriority;
  dueDate: string | null;
};

export type CreateTaskInput = SaveTaskInput;
export type UpdateTaskInput = SaveTaskInput;
