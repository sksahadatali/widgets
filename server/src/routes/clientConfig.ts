import { Router } from 'express';
import { createClientProjection, getHouseholdConfig } from '../config/householdConfig.js';
const router = Router();
router.get('/client', (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.json(createClientProjection());
});
router.get('/settings/household', (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.json({ homeAddress: getHouseholdConfig().travel.homeAddress });
});
export default router;
