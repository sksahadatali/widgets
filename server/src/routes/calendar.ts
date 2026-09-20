import { Router } from 'express';
import { getSafeCalendarData } from '../services/calendarProvider.js';
import { getHouseholdConfig, getRuntimeAppMode } from '../config/householdConfig.js';
import {
  CalendarProfileAssignmentStoreCorruptError,
  CalendarProfileAssignmentStoreError,
  calendarProfileAssignmentStore,
  resolveCalendarProfileAssignment,
} from '../services/calendarProfileAssignmentStore.js';
import {
  CalendarWindowRequestError,
  parseCalendarWindowStart,
} from '../services/calendarWindow.js';
const router = Router();

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

router.get('/', async (request, response) => {
  if (getRuntimeAppMode() === 'demo') {
    response.json({ calendarUrl: '', generatedAt: new Date().toISOString(), timeZone: 'Europe/London', events: [] });
    return;
  }
  try {
    const config = getHouseholdConfig();
    const startDate = parseCalendarWindowStart(
      request.query,
      new Date(),
      config.location.timezone,
    );
    const [data, store] = await Promise.all([
      getSafeCalendarData(startDate),
      calendarProfileAssignmentStore.read(),
    ]);
    const sources = config.calendar.sources;
    response.json({
      ...data,
      events: data.events.map(event => ({
        ...event,
        profileAssignment: resolveCalendarProfileAssignment(event.eventKey, event.source.id, store.assignments, sources),
      })),
    });
  } catch (error) {
    if (error instanceof CalendarWindowRequestError) {
      response.status(400).json({ error: error.message });
    } else if (error instanceof CalendarProfileAssignmentStoreError) sendAssignmentError(error, response);
    else response.status(502).json({ error: 'Calendar unavailable' });
  }
});
export default router;
