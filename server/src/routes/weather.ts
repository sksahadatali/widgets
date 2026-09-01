import { Router } from 'express';
import { getWeather } from '../services/weatherProvider.js';
import { getRuntimeAppMode } from '../config/householdConfig.js';
const router = Router();
router.get('/', async (_request, response) => {
  const demoLocation = { name: 'Example Town', latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London' };
  try { response.json(await getWeather(fetch, getRuntimeAppMode() === 'demo' ? demoLocation : undefined)); } catch { response.status(502).json({ error: 'Weather unavailable' }); }
});
export default router;
