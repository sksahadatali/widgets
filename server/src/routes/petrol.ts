import { Router } from 'express';

import { getPetrolPrice } from '../services/petrolService.js';

const router = Router();

router.get('/', async (_request, response) => {
  try {
    const petrol = await getPetrolPrice();

    response.json(petrol);
  } catch (error: any) {
    console.error(error);

    response.status(500).json({
      error: error.message,
      details: error.response?.data ?? null,
    });
  }
});

export default router;