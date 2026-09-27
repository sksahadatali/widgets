import { Router } from 'express';
import {
  getCalendarProviderErrorTiming,
  type CalendarProviderTiming,
  type TimedCalendarData,
} from '../services/calendarProvider.js';
import { getHouseholdConfig, getRuntimeAppMode } from '../config/householdConfig.js';
import {
  CalendarProfileAssignmentStoreCorruptError,
  CalendarProfileAssignmentStoreError,
  calendarProfileAssignmentStore,
  resolveCalendarProfileAssignment,
} from '../services/calendarProfileAssignmentStore.js';
import {
  CalendarWindowRequestError,
  parseCalendarWindowRequest,
} from '../services/calendarWindow.js';
import {
  CalendarWriteError,
  getCalendarEditContext,
  updateCalendarEvent,
} from '../services/calendarEventWriter.js';
import { calendarReadCoordinator } from '../services/calendarReadCoordinator.js';
const router = Router();

type CalendarReadRouteDependencies = {
  readCalendar: (request: import('../services/calendarWindow.js').CalendarWindowRequest) => Promise<TimedCalendarData>;
  readAssignments: typeof calendarProfileAssignmentStore.read;
  now: () => Date;
  clock: () => number;
};

const defaultReadDependencies: CalendarReadRouteDependencies = {
  readCalendar: request => calendarReadCoordinator.get(request),
  readAssignments: () => calendarProfileAssignmentStore.read(),
  now: () => new Date(),
  clock: () => performance.now(),
};

function duration(value: number): string {
  return Math.max(0, value).toFixed(1);
}

export function formatCalendarServerTiming(
  totalMs: number,
  timing?: CalendarProviderTiming,
): string {
  return [
    ...(timing ? [
      `provider;dur=${duration(timing.providerMs)}`,
      `processing;dur=${duration(timing.processingMs)}`,
    ] : []),
    `total;dur=${duration(totalMs)}`,
  ].join(', ');
}

function sendWriteError(error: unknown, response: import('express').Response): void {
  if (error instanceof CalendarWriteError) {
    response.status(error.status).json({ success: false, ...(error.code ? { code: error.code } : {}), error: error.message });
  } else {
    console.error('Calendar write endpoint failed.');
    response.status(502).json({ success: false, error: 'Calendar provider update failed.' });
  }
}

router.get('/events/:eventKey/edit-context', async (request, response) => {
  response.set('Cache-Control', 'no-store');
  try {
    response.json({ success: true, context: await getCalendarEditContext(request.params.eventKey) });
  } catch (error) { sendWriteError(error, response); }
});

router.patch('/events/:eventKey', async (request, response) => {
  response.set('Cache-Control', 'no-store');
  if (request.get('X-EYOS-Calendar-Write') !== '1') {
    response.status(400).json({ success: false, error: 'Calendar write confirmation header is required.' });
    return;
  }
  try {
    response.json({ success: true, context: await updateCalendarEvent(request.params.eventKey, request.body) });
  } catch (error) { sendWriteError(error, response); }
});

function sendAssignmentError(error: unknown, response: import('express').Response): void {
  if (error instanceof CalendarProfileAssignmentStoreCorruptError) {
    console.error('Calendar profile assignment store validation failed.');
    response.status(500).json({ success: false, error: 'Calendar profile assignments are unavailable.' });
  } else if (error instanceof CalendarProfileAssignmentStoreError) {
    response.status(400).json({ success: false, error: error.message });
  } else {
    console.error('Calendar profile assignment endpoint failed.');
    response.status(500).json({ success: false, error: 'Calendar profile assignments are unavailable.' });
  }
}

router.put('/profile-assignments/:eventKey', async (request, response) => {
  if (getRuntimeAppMode() === 'demo') {
    response.status(403).json({ success: false, error: 'Calendar profile assignments are disabled in Demo mode.' });
    return;
  }
  try {
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body) || Object.keys(request.body).length !== 1 || !Object.hasOwn(request.body as object, 'target')) {
      throw new CalendarProfileAssignmentStoreError('Calendar profile assignment request is invalid.');
    }
    const members = getHouseholdConfig().household.members.map(member => member.id);
    const assignment = await calendarProfileAssignmentStore.set(
      request.params.eventKey,
      request.body?.target as unknown,
      members,
    );
    response.json({ success: true, assignment });
  } catch (error) { sendAssignmentError(error, response); }
});

router.delete('/profile-assignments/:eventKey', async (request, response) => {
  if (getRuntimeAppMode() === 'demo') {
    response.status(403).json({ success: false, error: 'Calendar profile assignments are disabled in Demo mode.' });
    return;
  }
  try {
    response.json({ success: true, removed: await calendarProfileAssignmentStore.remove(request.params.eventKey) });
  } catch (error) { sendAssignmentError(error, response); }
});

export async function readCalendarRoute(
  request: import('express').Request,
  response: import('express').Response,
  dependencies: CalendarReadRouteDependencies = defaultReadDependencies,
): Promise<void> {
  const started = dependencies.clock();
  try {
    if (getRuntimeAppMode() === 'demo') {
      parseCalendarWindowRequest(
        request.query,
        dependencies.now(),
        'Europe/London',
      );
      response.set('Server-Timing', formatCalendarServerTiming(dependencies.clock() - started));
      response.json({ calendarUrl: '', generatedAt: new Date().toISOString(), timeZone: 'Europe/London', events: [] });
      return;
    }
    const config = getHouseholdConfig();
    const windowRequest = parseCalendarWindowRequest(
      request.query,
      dependencies.now(),
      config.location.timezone,
    );
    const [calendar, store] = await Promise.all([
      dependencies.readCalendar(windowRequest),
      dependencies.readAssignments(),
    ]);
    const sources = config.calendar.sources;
    response.set('Server-Timing', formatCalendarServerTiming(
      dependencies.clock() - started,
      calendar.timing,
    ));
    response.json({
      ...calendar.data,
      events: calendar.data.events.map(event => ({
        ...event,
        profileAssignment: resolveCalendarProfileAssignment(event.eventKey, event.source.id, store.assignments, sources),
      })),
    });
  } catch (error) {
    response.set('Server-Timing', formatCalendarServerTiming(
      dependencies.clock() - started,
      getCalendarProviderErrorTiming(error),
    ));
    if (error instanceof CalendarWindowRequestError) {
      response.status(400).json({ error: error.message });
    } else if (error instanceof CalendarProfileAssignmentStoreError) sendAssignmentError(error, response);
    else response.status(502).json({ error: 'Calendar unavailable' });
  }
}

router.get('/', (request, response) => {
  void readCalendarRoute(request, response);
});
export default router;
