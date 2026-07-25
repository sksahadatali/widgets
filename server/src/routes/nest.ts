import { Router } from 'express';
import { getNestStatus } from '../services/nestService.js';

const router = Router();

router.get('/status', async (_request, response) => {
  try {
    const status = await getNestStatus();

    response.json(status);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown Nest service error';

    console.error('Nest status request failed:', message);

    response.status(502).json({
      error: message,
    });
  }
});

export default router;