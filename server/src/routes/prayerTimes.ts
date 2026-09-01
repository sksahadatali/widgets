import { Router } from 'express';
import { getPrayerTimes } from '../services/prayerProvider.js';
import { getRuntimeAppMode } from '../config/householdConfig.js';
const router = Router();
router.get('/', async (_request, response) => {
  const demoAddress = 'Trafalgar Square, London, UK';
  try { response.json(await getPrayerTimes(fetch, getRuntimeAppMode() === 'demo' ? demoAddress : undefined)); } catch { response.status(502).json({ error: 'Prayer times unavailable' }); }
});
export default router;
