import { classifiedRouter } from '../access/classifiedRouter.js';
import { getWeather, getWeatherDemo } from '../services/weatherProvider.js';
const router = classifiedRouter('weather');
router.get('/', 'HOUSEHOLD', async (_request, response) => {
  try { response.json(await getWeather()); } catch { response.status(502).json({ error: 'Provider unavailable' }); }
}, async (_request, response) => {
  try { response.json(await getWeatherDemo()); } catch { response.status(502).json({ error: 'Provider unavailable' }); }
});
export default router.router;
