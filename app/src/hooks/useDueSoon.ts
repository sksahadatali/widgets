import {
    useCallback,
    useEffect,
    useState,
  } from 'react';
  
  import {
    fetchDueSoonTasks,
    type DueSoonTask,
  } from '../services/taskService';
  
  export function useDueSoon() {
    const [tasks, setTasks] = useState<
      DueSoonTask[]
    >([]);
  
    const [loading, setLoading] =
      useState(true);
  
    const [error, setError] =
      useState<string | null>(null);
  
    const loadTasks = useCallback(
      async () => {
        try {
          setError(null);
  
          const data =
            await fetchDueSoonTasks();
  
          setTasks(data);
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load tasks'
          );
        } finally {
          setLoading(false);
        }
      },
      []
    );
  
    useEffect(() => {
      loadTasks();
    }, [loadTasks]);
  
    return {
      tasks,
      loading,
      error,
      refresh: loadTasks,
    };
  }