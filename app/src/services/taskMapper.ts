import type { TaskItem } from "../types/task";

import type {
  FocusCategory,
  FocusItem,
  FocusPriority,
  FocusStatus,
} from "../types/focus";

function mapCategory(
  area: string
): FocusCategory {
  switch (area.toLowerCase()) {
    case "work":
      return "work";

    case "family":
      return "family";

    case "personal":
      return "personal";

    case "faith":
      return "faith";

    case "health":
      return "health";

    case "raen":
      return "raen";

    case "ayanoh":
      return "ayanoh";

    case "home":
      return "home";

    default:
      return "personal";
  }
}

function mapPriority(
  priority: string
): FocusPriority {
  switch (priority.toLowerCase()) {
    case "high":
      return "high";

    case "medium":
    case "normal":
      return "medium";

    case "low":
      return "low";

    default:
      return "medium";
  }
}

function mapStatus(
  status: string
): FocusStatus {
  switch (status.toLowerCase()) {
    case "done":
      return "completed";

    case "completed":
      return "completed";

    case "in progress":
      return "in-progress";

    case "in-progress":
      return "in-progress";

    case "waiting":
      return "waiting";

    case "not started":
      return "pending";

    case "pending":
      return "pending";

    default:
      return "pending";
  }
}

export function mapTaskToFocusItem(
  task: TaskItem
): FocusItem {
  return {
    id: task.id,
    title: task.task,

    category: mapCategory(task.area),

    priority: mapPriority(
      task.priority
    ),

    status: mapStatus(
      task.status
    ),

    dueDate: task.dueDate,
    dueTime: null,

    estimatedMinutes: 30,

    assignedTo: "You",
  };
}