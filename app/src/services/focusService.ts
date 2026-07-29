import focusItems from "../data/focus.json";
import type { FocusData, FocusItem } from "../types/focus";

const priorityScore: Record<FocusItem["priority"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function isDueToday(item: FocusItem): boolean {
  if (!item.dueDate) {
    return false;
  }

  const today = new Date().toISOString().slice(0, 10);

  return item.dueDate === today;
}

export async function getTodayFocus(): Promise<FocusData> {
  const items = focusItems as FocusItem[];

  const activeItems = items
    .filter((item) => item.status !== "completed")
    .filter((item) => isDueToday(item) || item.status === "in-progress")
    .sort((a, b) => {
      if (a.status === "in-progress" && b.status !== "in-progress") {
        return -1;
      }

      if (b.status === "in-progress" && a.status !== "in-progress") {
        return 1;
      }

      return priorityScore[b.priority] - priorityScore[a.priority];
    })
    .slice(0, 4);

  return {
    items: activeItems,
    generatedAt: new Date().toISOString(),
  };
}