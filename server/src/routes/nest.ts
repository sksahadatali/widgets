import { classifiedRouter } from '../access/classifiedRouter.js';
import { getNestStatus } from '../services/nestService.js';

const router = classifiedRouter('nest');

router.get('/status', 'HOUSEHOLD', async (_request, response) => {
  try {
    const status = await getNestStatus();

    response.json(status);
  } catch (error) {
    console.error('Nest provider request failed.');

    response.status(502).json({
      error: 'Nest unavailable',
    });
  }
});

export default router.router;