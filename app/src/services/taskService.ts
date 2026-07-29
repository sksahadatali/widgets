import type { CreateTaskInput, DueSoonTask, TaskItem, UpdateTaskInput } from '../types/task';

type TaskResponse<T> = { success: boolean; count: number; tasks: T[] };
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';
export const TASKS_CHANGED_EVENT = 'ey:tasks-changed';
const notifyTasksChanged = () => window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));

export async function fetchDueSoonTasks(): Promise<DueSoonTask[]> {
  const response = await fetch(`${API_BASE_URL}/api/tasks/due-soon`);
  if (!response.ok) throw new Error('Unable to load reminders');
  return ((await response.json()) as TaskResponse<DueSoonTask>).tasks;
}

export async function fetchTasks(): Promise<TaskItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/tasks`);
  if (!response.ok) throw new Error('Unable to load tasks');
  return ((await response.json()) as TaskResponse<TaskItem>).tasks;
}

export async function markTaskDone(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/tasks/${id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Done' }),
  });
  if (!response.ok) throw new Error('Unable to complete task');
  notifyTasksChanged();
}

export async function createTask(input: CreateTaskInput): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/tasks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error('Unable to create task');
  notifyTasksChanged();
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/tasks/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error('Unable to update task');
  notifyTasksChanged();
}
