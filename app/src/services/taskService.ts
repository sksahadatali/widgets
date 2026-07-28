export type DueState =
  | 'overdue'
  | 'today'
  | 'tomorrow'
  | 'upcoming';

export type DueSoonTask = {
  id: string;
  task: string;
  type: string;
  area: string;
  priority: string;
  dueDate: string;
  dueLabel: string;
  dueState: DueState;
  status: string;
  link: string | null;
};

export type TaskItem = {
  id: string;
  task: string;
  type: string;
  area: string;
  priority: string;
  dueDate: string | null;
  dueLabel: string | null;
  dueState: DueState | null;
  status: string;
  link: string | null;
};

export type CreateTaskInput = {
  task: string;
  area: string;
  priority: string;
  dueDate: string | null;
};

export type UpdateTaskInput = {
  task: string;
  type: 'Task' | 'Reminder';
  area: string;
  priority: string;
  dueDate: string | null;
};

type TaskResponse<T> = {
  success: boolean;
  count: number;
  tasks: T[];
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  'http://localhost:3001';

export async function fetchDueSoonTasks(): Promise<
  DueSoonTask[]
> {
  const response = await fetch(
    `${API_BASE_URL}/api/tasks/due-soon`
  );

  if (!response.ok) {
    throw new Error(
      'Unable to load reminders'
    );
  }

  const data =
    (await response.json()) as TaskResponse<DueSoonTask>;

  return data.tasks;
}

export async function fetchTasks(): Promise<
  TaskItem[]
> {
  const response = await fetch(
    `${API_BASE_URL}/api/tasks`
  );

  if (!response.ok) {
    throw new Error(
      'Unable to load tasks'
    );
  }

  const data =
    (await response.json()) as TaskResponse<TaskItem>;

  return data.tasks;
}

export async function markTaskDone(
  id: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/tasks/${id}/status`,
    {
      method: 'PATCH',

      headers: {
        'Content-Type':
          'application/json',
      },

      body: JSON.stringify({
        status: 'Done',
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      'Unable to complete task'
    );
  }
}

export async function createTask(
  input: CreateTaskInput
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/tasks`,
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json',
      },

      body: JSON.stringify(input),
    }
  );

  if (!response.ok) {
    throw new Error(
      'Unable to create task'
    );
  }
}

export async function updateTask(
  id: string,
  input: UpdateTaskInput
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/tasks/${id}`,
    {
      method: 'PATCH',

      headers: {
        'Content-Type':
          'application/json',
      },

      body: JSON.stringify(input),
    }
  );

  if (!response.ok) {
    throw new Error(
      'Unable to update task'
    );
  }
}