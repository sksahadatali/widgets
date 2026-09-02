import { Router } from 'express';
import { getSafeCalendarData } from '../services/calendarProvider.js';
import { getRuntimeAppMode } from '../config/householdConfig.js';
const router = Router();
router.get('/', async (_request, response) => {
  if (getRuntimeAppMode() === 'demo') {
    response.json({ calendarUrl: '', generatedAt: new Date().toISOString(), timeZone: 'Europe/London', events: [] });
    return;
  }
  try { response.json(await getSafeCalendarData()); } catch { response.status(502).json({ error: 'Calendar unavailable' }); }
});
export default router;
