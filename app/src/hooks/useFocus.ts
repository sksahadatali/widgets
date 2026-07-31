import { useEffect, useState } from "react";
import { getTodayFocus } from "../services/focusService";
import type { BrainResult } from "../brain/types";

interface UseFocusResult {
  brain: BrainResult | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useFocus(): UseFocusResult {
  const [brain, setBrain] =
  useState<BrainResult | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFocus = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const result = await getTodayFocus();

      setBrain(result);
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
    brain,
    loading,
    error,
    refresh: loadFocus,
  };
}