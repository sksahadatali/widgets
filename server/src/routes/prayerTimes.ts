import { classifiedRouter } from '../access/classifiedRouter.js';
import { getPrayerTimes, getPrayerTimesDemo } from '../services/prayerProvider.js';
const router = classifiedRouter('prayerTimes');
router.get('/', 'HOUSEHOLD', async (_request, response) => {
  try { response.json(await getPrayerTimes()); } catch { response.status(502).json({ error: 'Provider unavailable' }); }
}, async (_request, response) => {
  try { response.json(await getPrayerTimesDemo()); } catch { response.status(502).json({ error: 'Provider unavailable' }); }
});
export default router.router;
