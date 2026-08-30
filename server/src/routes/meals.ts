import { Router } from 'express';
import type { Response } from 'express';

import {
  MealPlanConflictError,
  MealPlanNotFoundError,
  MealPlanStoreCorruptError,
  MealPlanStoreError,
  mealPlanStore,
} from '../services/mealPlanStore.js';

const router = Router();

function sendMealError(
  error: unknown,
  response: Response
): void {
  if (error instanceof MealPlanStoreCorruptError) {
    console.error(
      'Local Meals store validation failed.'
    );
    response.status(500).json({
      success: false,
      error: 'Unable to access the local Meals store.',
    });
    return;
  }

  if (error instanceof MealPlanNotFoundError) {
    response.status(404).json({
      success: false,
      error: error.message,
    });
    return;
  }

  if (error instanceof MealPlanConflictError) {
    response.status(409).json({
      success: false,
      error: error.message,
    });
    return;
  }

  if (error instanceof MealPlanStoreError) {
    response.status(400).json({
      success: false,
      error: error.message,
    });
    return;
  }

  console.error('Meals endpoint failed.');
  response.status(500).json({
    success: false,
    error: 'Unable to access the local Meals store.',
  });
}

router.get('/', async (request, response) => {
  try {
    const weekStart = request.query.weekStart;

    if (typeof weekStart !== 'string') {
      throw new MealPlanStoreError(
        'Meals weekStart is required.'
      );
    }

    response.json({
      success: true,
      entries:
        await mealPlanStore.readWeek(weekStart),
    });
  } catch (error) {
    sendMealError(error, response);
  }
});

router.post('/', async (request, response) => {
  try {
    const result = await mealPlanStore.createEntry(
      request.body as unknown
    );

    response
      .status(result.created ? 201 : 200)
      .json({ success: true, ...result });
  } catch (error) {
    sendMealError(error, response);
  }
});

router.patch('/:entryId', async (request, response) => {
  try {
    const result = await mealPlanStore.updateEntry(
      request.params.entryId,
      request.body as unknown
    );

    response.json({ success: true, ...result });
  } catch (error) {
    sendMealError(error, response);
  }
});

router.delete('/:entryId', async (request, response) => {
  try {
    const result = await mealPlanStore.removeEntry(
      request.params.entryId
    );

    response.json({ success: true, ...result });
  } catch (error) {
    sendMealError(error, response);
  }
});

export default router;
