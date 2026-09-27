import { getHouseholdConfig } from '../config/householdConfig.js';
import {
  getTimedSafeCalendarData,
  type TimedCalendarData,
} from './calendarProvider.js';
import {
  getCalendarWindowKey,
  type CalendarWindowRequest,
} from './calendarWindow.js';

type CalendarRead = (
  request: CalendarWindowRequest,
) => Promise<TimedCalendarData>;

type CalendarReadCoordinatorOptions = {
  read?: CalendarRead;
  now?: () => Date;
  timeZone?: () => string;
};

export class CalendarReadCoordinator {
  private readonly inFlight = new Map<string, Promise<TimedCalendarData>>();
  private readonly read: CalendarRead;
  private readonly now: () => Date;
  private readonly timeZone: () => string;

  constructor(options: CalendarReadCoordinatorOptions = {}) {
    this.read = options.read ?? (request => getTimedSafeCalendarData(request));
    this.now = options.now ?? (() => new Date());
    this.timeZone = options.timeZone ?? (() => getHouseholdConfig().location.timezone);
  }

  get(request: CalendarWindowRequest): Promise<TimedCalendarData> {
    const key = getCalendarWindowKey(request, this.now(), this.timeZone());
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const operation = this.read(request);
    this.inFlight.set(key, operation);
    void operation.finally(() => {
      if (this.inFlight.get(key) === operation) this.inFlight.delete(key);
    }).catch(() => undefined);
    return operation;
  }

  activeCount(): number {
    return this.inFlight.size;
  }
}

export const calendarReadCoordinator = new CalendarReadCoordinator();
