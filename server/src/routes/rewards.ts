import {
  randomUUID,
} from 'node:crypto';

import { Router } from 'express';
import type { Response } from 'express';

import {
  getRewardBalances,
} from '../rewards/rewardSelectors.js';
import {
  RewardIdempotencyConflictError,
  RewardNotFoundError,
  RewardStoreCorruptError,
  RewardStoreError,
  rewardStore,
} from '../services/rewardStore.js';

const router = Router();

function sendRewardError(
  error: unknown,
  response: Response
): void {
  if (error instanceof RewardStoreCorruptError) {
    console.error(
      'Local rewards store validation failed.'
    );
    response.status(500).json({
      success: false,
      error:
        'Unable to access the local rewards store.',
    });
    return;
  }

  if (
    error instanceof
      RewardIdempotencyConflictError
  ) {
    response.status(409).json({
      success: false,
      error:
        'Reward request conflicts with an existing event.',
    });
    return;
  }

  if (error instanceof RewardNotFoundError) {
    response.status(404).json({
      success: false,
      error: 'Reward transaction was not found.',
    });
    return;
  }

  if (error instanceof RewardStoreError) {
    response.status(400).json({
      success: false,
      error: error.message,
    });
    return;
  }

  console.error('Rewards endpoint failed.');
  response.status(500).json({
    success: false,
    error:
      'Unable to access the local rewards store.',
  });
}

router.get('/', async (_request, response) => {
  try {
    const store = await rewardStore.read();

    response.json({
      success: true,
      store,
      balances: getRewardBalances(
        store.transactions
      ),
    });
  } catch (error) {
    sendRewardError(error, response);
  }
});

router.post('/awards', async (request, response) => {
  try {
    const result = await rewardStore.appendManualAward(
      randomUUID(),
      request.body as unknown
    );

    response.status(result.created ? 201 : 200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    sendRewardError(error, response);
  }
});

router.post(
  '/transactions/:id/reversal',
  async (request, response) => {
    try {
      const result =
        await rewardStore.reverseTransaction(
          randomUUID(),
          request.params.id,
          request.body as unknown
        );

      response.status(
        result.created ? 201 : 200
      ).json({
        success: true,
        ...result,
      });
    } catch (error) {
      sendRewardError(error, response);
    }
  }
);

export default router;
