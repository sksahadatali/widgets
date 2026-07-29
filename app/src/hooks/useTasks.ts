import { useCallback, useEffect, useState } from 'react';
import { createTask, fetchTasks, markTaskDone, TASKS_CHANGED_EVENT, updateTask } from '../services/taskService';
import type { CreateTaskInput, TaskItem, UpdateTaskInput } from '../types/task';

export function useTasks() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setError(null); setTasks(await fetchTasks()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load tasks'); }
    finally { setLoading(false); }
  }, []);

  const completeTask = useCallback(async (id: string) => {
    try { setUpdatingId(id); setError(null); await markTaskDone(id); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to complete task'); }
    finally { setUpdatingId(null); }
  }, []);

  const addTask = useCallback(async (input: CreateTaskInput) => {
    try { setCreating(true); setError(null); await createTask(input); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to create task'); throw e; }
    finally { setCreating(false); }
  }, []);

  const editTask = useCallback(async (id: string, input: UpdateTaskInput) => {
    try { setEditingId(id); setError(null); await updateTask(id, input); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update task'); throw e; }
    finally { setEditingId(null); }
  }, []);

  useEffect(() => {
    void refresh();
    const handler = () => void refresh();
    window.addEventListener(TASKS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(TASKS_CHANGED_EVENT, handler);
  }, [refresh]);

  return { tasks, loading, error, updatingId, creating, editingId, refresh, completeTask, addTask, editTask };
}
