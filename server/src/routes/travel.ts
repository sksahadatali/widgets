import { Router } from 'express';
import { getRoute } from '../services/travelProvider.js';
const router = Router();
router.post('/route', async (request, response) => {
  const keys = request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? Object.keys(request.body) : [];
  const destination = keys.length === 1 && keys[0] === 'destination' && typeof request.body.destination === 'string' ? request.body.destination.trim() : '';
  if (!destination || destination.length > 500 || /[\u0000-\u001f\u007f]/.test(destination)) { response.status(400).json({ error: 'Invalid travel destination' }); return; }
  try { response.json(await getRoute(destination)); } catch { response.status(502).json({ error: 'Travel information unavailable' }); }
});
export default router;
