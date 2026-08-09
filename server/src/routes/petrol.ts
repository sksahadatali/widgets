import { Router } from 'express';

import { getPetrolPrice } from '../services/petrolService.js';

const router = Router();

router.get('/', async (_request, response) => {
  console.log(
    `[API] Petrol endpoint called: ${new Date().toLocaleTimeString()}`
  );

  try {
    const petrol = await getPetrolPrice();

    response.json(petrol);
  } catch (error: any) {
    console.error('[API] Petrol endpoint error:', error.message);

    response.status(500).json({
      error: error.message,
      details: error.response?.data ?? null,
    });
  }
});

export default router;