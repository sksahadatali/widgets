import { Router } from 'express';
import { getNestStatus } from '../services/nestService';

const router = Router();

router.get('/status', async (_req, res) => {
  try {
    const data = await getNestStatus();
    res.json(data);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

export default router;