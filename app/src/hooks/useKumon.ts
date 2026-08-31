import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useHouseholdProfile,
} from '../household/useHouseholdProfile';
import {
  getKumonChildren,
  selectVisibleKumonAssignments,
} from '../kumon/kumonSelectors';
import {
  getKumonToday,
  shiftKumonDate,
} from '../kumon/kumonDates';
import {
  createKumonAssignment,
  deleteKumonAssignment,
  loadKumonAssignments,
  setKumonProgress,
  updateKumonAssignment,
} from '../services/kumonService';
import {
  getHouseholdConfig,
} from '../services/householdConfigService';
import type {
  CreateKumonAssignmentInput,
  KumonAssignment,
  UpdateKumonAssignmentInput,
} from '../types/kumon';

export function useKumon() {
  const { profiles, selectedProfile } = useHouseholdProfile();
  const timeZone = getHouseholdConfig().location.timezone;
  const [clock, setClock] = useState(() => new Date());
  const [assignments, setAssignments] = useState<KumonAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = useMemo(() => getKumonToday(clock, timeZone), [clock, timeZone]);
  const from = useMemo(() => shiftKumonDate(today, -6), [today]);

  const refresh = useCallback(async () => {
    try {
      const now = new Date();
      const localToday = getKumonToday(now, timeZone);
      setClock(now);
      setAssignments(await loadKumonAssignments(shiftKumonDate(localToday, -6), localToday));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Kumon is unavailable.');
    } finally {
      setLoading(false);
    }
  }, [timeZone]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const update = () => void refresh();
    const visible = () => { if (!document.hidden) update(); };
    const interval = window.setInterval(update, 60000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);

  const runMutation = useCallback(async (mutation: () => Promise<void>) => {
    setSaving(true);
    try {
      await mutation();
      await refresh();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Unable to update Kumon.');
      throw mutationError;
    } finally {
      setSaving(false);
    }
  }, [refresh]);

  const visibleAssignments = useMemo(() => selectVisibleKumonAssignments({
    assignments, profiles, selectedProfile,
  }), [assignments, profiles, selectedProfile]);

  return {
    assignments: visibleAssignments,
    todayAssignments: visibleAssignments.filter(assignment => assignment.localDate === today),
    historyAssignments: visibleAssignments.filter(assignment => assignment.localDate !== today),
    children: getKumonChildren(profiles),
    selectedProfile,
    today,
    from,
    timeZone,
    loading,
    saving,
    error,
    refresh,
    createAssignment: (input: CreateKumonAssignmentInput) =>
      runMutation(() => createKumonAssignment(input, timeZone)),
    updateAssignment: (id: string, input: UpdateKumonAssignmentInput) =>
      runMutation(() => updateKumonAssignment(id, input, timeZone)),
    setProgress: (id: string, completedUnits: number) =>
      runMutation(() => setKumonProgress(id, completedUnits, timeZone)),
    removeAssignment: (id: string) =>
      runMutation(() => deleteKumonAssignment(id, timeZone)),
  };
}
