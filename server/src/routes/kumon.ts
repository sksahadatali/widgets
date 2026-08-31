import { randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';

import {
  KumonConflictError,
  KumonNotFoundError,
  KumonStoreCorruptError,
  KumonStoreError,
  kumonStore,
} from '../services/kumonStore.js';

const router = Router();

function sendError(error: unknown, response: Response): void {
  if (error instanceof KumonStoreCorruptError) {
    console.error('Local Kumon store validation failed.');
    response.status(500).json({ success: false, error: error.message });
  } else if (error instanceof KumonNotFoundError) {
    response.status(404).json({ success: false, error: error.message });
  } else if (error instanceof KumonConflictError) {
    response.status(409).json({ success: false, error: error.message });
  } else if (error instanceof KumonStoreError) {
    response.status(400).json({ success: false, error: error.message });
  } else {
    console.error('Kumon endpoint error:', error);
    response.status(500).json({ success: false, error: 'Unable to access the local Kumon store.' });
  }
}

router.get('/', async (request, response) => {
  try {
    const from = typeof request.query.from === 'string' ? request.query.from : null;
    const to = typeof request.query.to === 'string' ? request.query.to : null;
    const assignments = from && to
      ? await kumonStore.readRange(from, to)
      : (await kumonStore.read()).assignments;
    response.json({ success: true, assignments });
  } catch (error) {
    sendError(error, response);
  }
});

router.post('/', async (request, response) => {
  try {
    const result = await kumonStore.createAssignment(randomUUID(), request.body as unknown);
    response.status(201).json({ success: true, ...result });
  } catch (error) {
    sendError(error, response);
  }
});

router.patch('/:id', async (request, response) => {
  try {
    const assignment = await kumonStore.updateAssignment(request.params.id, request.body as unknown);
    response.json({ success: true, assignment });
  } catch (error) {
    sendError(error, response);
  }
});

router.patch('/:id/progress', async (request, response) => {
  try {
    const assignment = await kumonStore.setProgress(request.params.id, request.body as unknown);
    response.json({ success: true, assignment });
  } catch (error) {
    sendError(error, response);
  }
});

router.delete('/:id', async (request, response) => {
  try {
    const timeZone = typeof request.body === 'object' && request.body !== null
      ? (request.body as Record<string, unknown>).timeZone
      : undefined;
    await kumonStore.deleteAssignment(request.params.id, timeZone);
    response.json({ success: true });
  } catch (error) {
    sendError(error, response);
  }
});

export default router;
