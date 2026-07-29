import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  createTask,
  fetchDueSoonTasks,
  TASKS_CHANGED_EVENT,
  updateTask,
} from '../services/taskService';

import type {
  CreateTaskInput,
  DueSoonTask,
  UpdateTaskInput,
} from '../types/task';

export function useDueSoon() {
  const [tasks, setTasks] =
    useState<DueSoonTask[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [creating, setCreating] =
    useState(false);

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const refresh = useCallback(
    async () => {
      try {
        setError(null);

        const data =
          await fetchDueSoonTasks();

        setTasks(data);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Unable to load reminders'
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const addReminder =
    useCallback(
      async (
        input: CreateTaskInput
      ) => {
        try {
          setCreating(true);
          setError(null);

          await createTask(input);
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : 'Unable to create reminder'
          );

          throw error;
        } finally {
          setCreating(false);
        }
      },
      []
    );

  const editReminder =
    useCallback(
      async (
        id: string,
        input: UpdateTaskInput
      ) => {
        try {
          setEditingId(id);
          setError(null);

          await updateTask(
            id,
            input
          );
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : 'Unable to update reminder'
          );

          throw error;
        } finally {
          setEditingId(null);
        }
      },
      []
    );

  useEffect(() => {
    void refresh();

    function handleTasksChanged() {
      void refresh();
    }

    window.addEventListener(
      TASKS_CHANGED_EVENT,
      handleTasksChanged
    );

    return () => {
      window.removeEventListener(
        TASKS_CHANGED_EVENT,
        handleTasksChanged
      );
    };
  }, [refresh]);

  return {
    tasks,
    loading,
    error,
    creating,
    editingId,
    refresh,
    addReminder,
    editReminder,
  };
}