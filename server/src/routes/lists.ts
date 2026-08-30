import { Router } from 'express';
import type { Response } from 'express';

import {
  FamilyListConflictError,
  FamilyListNotFoundError,
  FamilyListStoreCorruptError,
  FamilyListStoreError,
  familyListStore,
} from '../services/familyListStore.js';

const router = Router();

function sendListError(error: unknown, response: Response): void {
  if (error instanceof FamilyListStoreCorruptError) {
    console.error('Local Lists store validation failed.');
    response.status(500).json({
      success: false,
      error: 'Unable to access the local Lists store.',
    });
    return;
  }
  if (error instanceof FamilyListNotFoundError) {
    response.status(404).json({ success: false, error: error.message });
    return;
  }
  if (error instanceof FamilyListConflictError) {
    response.status(409).json({ success: false, error: error.message });
    return;
  }
  if (error instanceof FamilyListStoreError) {
    response.status(400).json({ success: false, error: error.message });
    return;
  }
  console.error('Lists endpoint failed.');
  response.status(500).json({
    success: false,
    error: 'Unable to access the local Lists store.',
  });
}

router.get('/', async (_request, response) => {
  try {
    response.json({ success: true, store: await familyListStore.read() });
  } catch (error) {
    sendListError(error, response);
  }
});

router.post('/', async (request, response) => {
  try {
    const result = await familyListStore.createList(request.body as unknown);
    response.status(result.created ? 201 : 200).json({ success: true, ...result });
  } catch (error) {
    sendListError(error, response);
  }
});

router.patch('/order', async (request, response) => {
  try {
    const store = await familyListStore.reorderLists(
      request.body?.orderedIds as unknown
    );
    response.json({ success: true, store });
  } catch (error) {
    sendListError(error, response);
  }
});

router.patch('/:listId', async (request, response) => {
  try {
    const result = await familyListStore.renameList(
      request.params.listId,
      request.body?.name as unknown
    );
    response.json({ success: true, ...result });
  } catch (error) {
    sendListError(error, response);
  }
});

router.patch('/:listId/active', async (request, response) => {
  try {
    const result = await familyListStore.setListActive(
      request.params.listId,
      request.body?.active as unknown
    );
    response.json({ success: true, ...result });
  } catch (error) {
    sendListError(error, response);
  }
});

router.post('/:listId/items', async (request, response) => {
  try {
    const result = await familyListStore.createItem(
      request.params.listId,
      request.body as unknown
    );
    response.status(result.created ? 201 : 200).json({ success: true, ...result });
  } catch (error) {
    sendListError(error, response);
  }
});

router.patch('/:listId/items/order', async (request, response) => {
  try {
    const store = await familyListStore.reorderItems(
      request.params.listId,
      request.body?.orderedIds as unknown
    );
    response.json({ success: true, store });
  } catch (error) {
    sendListError(error, response);
  }
});

router.patch('/:listId/items/:itemId', async (request, response) => {
  try {
    const result = await familyListStore.editItem(
      request.params.listId,
      request.params.itemId,
      request.body?.title as unknown
    );
    response.json({ success: true, ...result });
  } catch (error) {
    sendListError(error, response);
  }
});

router.patch('/:listId/items/:itemId/checked', async (request, response) => {
  try {
    const result = await familyListStore.setItemChecked(
      request.params.listId,
      request.params.itemId,
      request.body?.checked as unknown
    );
    response.json({ success: true, ...result });
  } catch (error) {
    sendListError(error, response);
  }
});

router.delete('/:listId/items/checked', async (request, response) => {
  try {
    const result = await familyListStore.clearChecked(request.params.listId);
    response.json({ success: true, ...result });
  } catch (error) {
    sendListError(error, response);
  }
});

router.delete('/:listId/items/:itemId', async (request, response) => {
  try {
    const result = await familyListStore.removeItem(
      request.params.listId,
      request.params.itemId
    );
    response.json({ success: true, ...result });
  } catch (error) {
    sendListError(error, response);
  }
});

export default router;
