import cors from 'cors';
import express from 'express';

import { env } from './config/env.js';

import nestRouter from './routes/nest.js';
import tasksRouter from './routes/tasks.js';
import petrolRouter from './routes/petrol.js';

const app = express();

app.disable('x-powered-by');

// CORS FIRST
app.use(
  cors({
    origin: env.frontendOrigin,
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Content-Type'],
  })
);

app.use(express.json());

// THEN routes
app.use('/api/petrol', petrolRouter);
app.use('/api/nest', nestRouter);
app.use('/api/tasks', tasksRouter);

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
});