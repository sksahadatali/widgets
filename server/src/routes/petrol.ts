import { classifiedRouter } from '../access/classifiedRouter.js';

import { getPetrolPrice } from '../services/petrolService.js';

const router = classifiedRouter('petrol');

router.get('/', 'HOUSEHOLD', async (_request, response) => {
  console.log(
    `[API] Petrol endpoint called: ${new Date().toLocaleTimeString()}`
  );

  try {
    const petrol = await getPetrolPrice();

    response.json(petrol);
  } catch (error: any) {
    console.error('Petrol provider request failed.');

    response.status(500).json({
      error: 'Petrol unavailable',
    });
  }
});

export default router.router;