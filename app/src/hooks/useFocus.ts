import { useEffect, useState } from "react";
import { getTodayFocus } from "../services/focusService";
import type { FocusItem } from "../types/focus";

interface UseFocusResult {
  items: FocusItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useFocus(): UseFocusResult {
  const [items, setItems] = useState<FocusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFocus = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const result = await getTodayFocus();

      setItems(result.items);
    } catch (err) {
      console.error("Failed to load Today's Focus:", err);
      setError("Unable to load today's focus.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFocus();
  }, []);

  return {
    items,
    loading,
    error,
    refresh: loadFocus,
  };
}