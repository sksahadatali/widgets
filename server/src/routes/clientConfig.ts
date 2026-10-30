import { classifiedRouter } from '../access/classifiedRouter.js';
import { createClientProjection, getHouseholdConfig } from '../config/householdConfig.js';
const router = classifiedRouter('clientConfig');
router.get('/client', 'HOUSEHOLD', (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.json(createClientProjection());
});
router.get('/settings/household', 'HOUSEHOLD', (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.json({ homeAddress: getHouseholdConfig().travel.homeAddress });
});
export default router.router;
