import {
    useCallback,
    useEffect,
    useState,
  } from 'react';
  
  import {
    createTask,
    fetchTasks,
    markTaskDone,
    updateTask,
    type CreateTaskInput,
    type TaskItem,
    type UpdateTaskInput,
  } from '../services/taskService';
  
  export function useTasks() {
    const [tasks, setTasks] =
      useState<TaskItem[]>([]);
  
    const [loading, setLoading] =
      useState(true);
  
    const [error, setError] =
      useState<string | null>(null);
  
    const [updatingId, setUpdatingId] =
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
            await fetchTasks();
  
          setTasks(data);
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : 'Unable to load tasks'
          );
        } finally {
          setLoading(false);
        }
      },
      []
    );
  
    const completeTask =
      useCallback(
        async (id: string) => {
          try {
            setUpdatingId(id);
            setError(null);
  
            await markTaskDone(id);
  
            setTasks(
              current =>
                current.filter(
                  task =>
                    task.id !== id
                )
            );
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : 'Unable to complete task'
            );
          } finally {
            setUpdatingId(null);
          }
        },
        []
      );
  
    const addTask =
      useCallback(
        async (
          input: CreateTaskInput
        ) => {
          try {
            setCreating(true);
            setError(null);
  
            await createTask(input);
  
            await refresh();
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : 'Unable to create task'
            );
  
            throw error;
          } finally {
            setCreating(false);
          }
        },
        [refresh]
      );
  
    const editTask =
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
  
            await refresh();
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : 'Unable to update task'
            );
  
            throw error;
          } finally {
            setEditingId(null);
          }
        },
        [refresh]
      );
  
    useEffect(() => {
      void refresh();
    }, [refresh]);
  
    return {
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
    };
  }