import {
  randomUUID,
} from 'node:crypto';

import {
  Router,
} from 'express';
import type {
  Response,
} from 'express';

import {
  RoutineNotFoundError,
  RoutineStoreCorruptError,
  RoutineStoreError,
  routineStore,
} from '../services/routineStore.js';
const router = Router();

function sendRoutineError(
  error: unknown,
  response: Response
): void {
  if (error instanceof RoutineStoreCorruptError) {
    console.error(
      'Local routines store validation failed.'
    );

    response.status(500).json({
      success: false,
      error: error.message,
    });
    return;
  }

  if (error instanceof RoutineNotFoundError) {
    response.status(404).json({
      success: false,
      error: error.message,
    });
    return;
  }

  if (error instanceof RoutineStoreError) {
    response.status(400).json({
      success: false,
      error: error.message,
    });
    return;
  }

  console.error(
    'Routine endpoint error:',
    error
  );

  response.status(500).json({
    success: false,
    error:
      'Unable to access the local routines store.',
  });
}

router.get('/', async (request, response) => {
  try {
    const store = await routineStore.read();
    const localDate =
      typeof request.query.localDate === 'string'
        ? request.query.localDate
        : null;

    response.json({
      success: true,
      routines: store.routines,
      occurrences: localDate
        ? store.occurrences.filter(
          occurrence =>
            occurrence.localDate === localDate
        )
        : store.occurrences,
    });
  } catch (error) {
    sendRoutineError(error, response);
  }
});

router.post('/', async (request, response) => {
  try {
    const routine =
      await routineStore.createRoutine(
        randomUUID(),
        request.body as unknown
      );

    response.status(201).json({
      success: true,
      routine,
    });
  } catch (error) {
    sendRoutineError(error, response);
  }
});

router.patch('/:id', async (request, response) => {
  try {
    const routine =
      await routineStore.updateRoutine(
        request.params.id,
        request.body as unknown
      );

    response.json({
      success: true,
      routine,
    });
  } catch (error) {
    sendRoutineError(error, response);
  }
});

router.delete('/:id', async (request, response) => {
  try {
    await routineStore.deleteRoutine(
      request.params.id
    );

    response.json({
      success: true,
    });
  } catch (error) {
    sendRoutineError(error, response);
  }
});

router.patch(
  '/:id/occurrence',
  async (request, response) => {
    try {
      const occurrence =
        await routineStore.updateOccurrence(
          request.params.id,
          request.body as unknown
        );

      response.json({
        success: true,
        occurrence,
      });
    } catch (error) {
      sendRoutineError(error, response);
    }
  }
);

export default router;
