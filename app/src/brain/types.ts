import type { CalendarEvent } from "../services/calendarService";
import type { FocusItem } from "../types/focus";

export interface BrainInput {
  focusItems: FocusItem[];
  calendarEvents: CalendarEvent[];
}