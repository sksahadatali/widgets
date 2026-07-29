export type FocusPriority = "high" | "medium" | "low";

export type FocusStatus =
  | "pending"
  | "in-progress"
  | "waiting"
  | "completed";

export type FocusCategory =
  | "work"
  | "family"
  | "personal"
  | "faith"
  | "health"
  | "raen"
  | "ayanoh"
  | "home";

export interface FocusItem {
  id: string;
  title: string;
  category: FocusCategory;
  priority: FocusPriority;
  status: FocusStatus;
  dueDate: string | null;
  dueTime: string | null;
  estimatedMinutes: number | null;
  assignedTo: string;
}

export interface FocusData {
  items: FocusItem[];
  generatedAt: string;
}