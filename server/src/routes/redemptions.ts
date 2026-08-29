import { Router } from 'express';
import type { Response } from 'express';

import {
  RedemptionAccountingError,
  RedemptionAccountingIntegrityError,
  redemptionAccountingService,
} from '../services/redemptionAccountingService.js';
import {
  RedemptionConflictError,
  RedemptionNotFoundError,
  RedemptionStoreCorruptError,
  RedemptionStoreError,
  redemptionStore,
} from '../services/redemptionStore.js';
import {
  RewardIdempotencyConflictError,
  RewardInsufficientBalanceError,
  RewardStoreCorruptError,
  RewardStoreError,
} from '../services/rewardStore.js';

const router = Router();

function sendRedemptionError(
  error: unknown,
  response: Response
): void {
  if (error instanceof RedemptionStoreCorruptError) {
    console.error(
      'Local Redemption store validation failed.'
    );
    response.status(500).json({
      success: false,
      error:
        'Unable to access the local Redemption store.',
    });
    return;
  }
  if (error instanceof RewardStoreCorruptError) {
    console.error(
      'Local Rewards store validation failed during Redemption accounting.'
    );
    response.status(500).json({
      success: false,
      error:
        'Unable to access the local Rewards store.',
    });
    return;
  }
  if (error instanceof RedemptionNotFoundError) {
    response.status(404).json({
      success: false,
      error: error.message,
    });
    return;
  }
  if (
    error instanceof RedemptionConflictError ||
    error instanceof RewardInsufficientBalanceError ||
    error instanceof RewardIdempotencyConflictError ||
    error instanceof RedemptionAccountingIntegrityError
  ) {
    response.status(409).json({
      success: false,
      error: error.message,
    });
    return;
  }
  if (
    error instanceof RedemptionAccountingError ||
    error instanceof RewardStoreError
  ) {
    response.status(400).json({
      success: false,
      error: error.message,
    });
    return;
  }
  if (error instanceof RedemptionStoreError) {
    response.status(400).json({
      success: false,
      error: error.message,
    });
    return;
  }
  console.error('Redemption endpoint failed.');
  response.status(500).json({
    success: false,
    error:
      'Unable to access the local Redemption store.',
  });
}

router.get('/', async (_request, response) => {
  try {
    const store = await redemptionStore.read();
    response.json({ success: true, store });
  } catch (error) {
    sendRedemptionError(error, response);
  }
});

router.post('/catalogue', async (request, response) => {
  try {
    const result =
      await redemptionStore.createCatalogueItem(
        request.body as unknown
      );
    response.status(result.created ? 201 : 200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    sendRedemptionError(error, response);
  }
});

router.put('/catalogue/order', async (request, response) => {
  try {
    const store = await redemptionStore.reorderCatalogue(
      request.body?.orderedIds as unknown
    );
    response.json({ success: true, store });
  } catch (error) {
    sendRedemptionError(error, response);
  }
});

router.patch('/catalogue/:id', async (request, response) => {
  try {
    const result =
      await redemptionStore.updateCatalogueItem(
        request.params.id,
        request.body as unknown
      );
    response.json({ success: true, ...result });
  } catch (error) {
    sendRedemptionError(error, response);
  }
});

router.patch(
  '/catalogue/:id/active',
  async (request, response) => {
    try {
      const result =
        await redemptionStore.setCatalogueItemActive(
          request.params.id,
          request.body?.active as unknown
        );
      response.json({ success: true, ...result });
    } catch (error) {
      sendRedemptionError(error, response);
    }
  }
);

router.post('/requests', async (request, response) => {
  try {
    const result = await redemptionStore.createRequest(
      request.body as unknown
    );
    response.status(result.created ? 201 : 200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    sendRedemptionError(error, response);
  }
});

router.post(
  '/requests/:id/cancel',
  async (request, response) => {
    try {
      const result = await redemptionAccountingService.cancel(
        request.params.id,
        request.body?.actorProfileId as unknown
      );
      response.status(result.created ? 201 : 200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      sendRedemptionError(error, response);
    }
  }
);

router.post(
  '/requests/:id/decline',
  async (request, response) => {
    try {
      const result = await redemptionAccountingService.decline(
        request.params.id,
        request.body?.actorProfileId as unknown
      );
      response.status(result.created ? 201 : 200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      sendRedemptionError(error, response);
    }
  }
);

router.post(
  '/requests/:id/approve',
  async (request, response) => {
    try {
      const result =
        await redemptionAccountingService.approve(
          request.params.id,
          request.body?.actorProfileId as unknown
        );
      response.status(result.created ? 201 : 200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      sendRedemptionError(error, response);
    }
  }
);

router.post(
  '/requests/:id/refund',
  async (request, response) => {
    try {
      const result =
        await redemptionAccountingService.refund(
          request.params.id,
          request.body?.actorProfileId as unknown
        );
      response.status(result.created ? 201 : 200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      sendRedemptionError(error, response);
    }
  }
);

export default router;
