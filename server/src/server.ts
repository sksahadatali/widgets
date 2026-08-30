import cors from 'cors';
import express from 'express';

import { env } from './config/env.js';

import nestRouter from './routes/nest.js';
import tasksRouter from './routes/tasks.js';
import petrolRouter from './routes/petrol.js';
import routinesRouter from './routes/routines.js';
import rewardsRouter from './routes/rewards.js';
import redemptionsRouter from './routes/redemptions.js';
import listsRouter from './routes/lists.js';
import { reconcileRoutineRewards } from './services/routineRewardReconciler.js';

const app = express();

app.disable('x-powered-by');

// CORS FIRST
app.use(
  cors({
    origin: env.frontendOrigin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type'],
  })
);

app.use(express.json());

// THEN routes
app.use('/api/petrol', petrolRouter);
app.use('/api/nest', nestRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/routines', routinesRouter);
app.use('/api/rewards', rewardsRouter);
app.use('/api/redemptions', redemptionsRouter);
app.use('/api/lists', listsRouter);

app.get('/health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'eY OS Server',
    timestamp: new Date().toISOString(),
  });
});

app.use((_request, response) => {
  response.status(404).json({
    error: 'Route not found',
  });
});

app.listen(env.port, () => {
  console.log(
    `eY OS Server running at http://localhost:${env.port}`
  );
  void reconcileRoutineRewards().catch(() => {
    console.error(
      'Automatic Routine reward startup reconciliation is pending.'
    );
  });
});
