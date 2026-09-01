import {
  accessSync,
  constants,
  statSync,
} from 'node:fs';
import {
  extname,
  join,
} from 'node:path';
import {
  fileURLToPath,
} from 'node:url';

import cors from 'cors';
import express from 'express';
import type {
  NextFunction,
  Request,
  Response,
} from 'express';

import kumonRouter from './routes/kumon.js';
import listsRouter from './routes/lists.js';
import mealsRouter from './routes/meals.js';
import nestRouter from './routes/nest.js';
import petrolRouter from './routes/petrol.js';
import redemptionsRouter from './routes/redemptions.js';
import rewardsRouter from './routes/rewards.js';
import routinesRouter from './routes/routines.js';
import tasksRouter from './routes/tasks.js';

export type ServerMode =
  | 'development'
  | 'production';

export type CreateAppOptions = {
  mode: ServerMode;
  frontendOrigin?: string;
  frontendDistPath?: string;
};

export const DEFAULT_FRONTEND_DIST_PATH =
  fileURLToPath(
    new URL('../../app/dist/', import.meta.url)
  );

const REVALIDATE_CACHE_CONTROL =
  'public, max-age=0, must-revalidate';
const IMMUTABLE_CACHE_CONTROL =
  'public, max-age=31536000, immutable';
const INDEX_CACHE_CONTROL =
  'no-cache, must-revalidate';

function assertProductionFrontend(
  frontendDistPath: string
): string {
  const indexPath = join(
    frontendDistPath,
    'index.html'
  );

  try {
    if (
      !statSync(frontendDistPath).isDirectory() ||
      !statSync(indexPath).isFile()
    ) {
      throw new Error('Invalid production frontend build.');
    }
    accessSync(indexPath, constants.R_OK);
  } catch {
    throw new Error(
      'Production frontend build is missing. ' +
      'Run the production build before starting eY OS.'
    );
  }

  return indexPath;
}

function acceptsHtml(request: Request): boolean {
  const accept = request.get('Accept') ?? '';

  return accept
    .split(',')
    .some(value => {
      const mediaType = value
        .split(';', 1)[0]
        ?.trim()
        .toLowerCase();

      return (
        mediaType === 'text/html' ||
        mediaType === 'application/xhtml+xml'
      );
    });
}

export function createApp(
  options: CreateAppOptions
) {
  const app = express();
  const isProduction =
    options.mode === 'production';

  app.set(
    'env',
    isProduction
      ? 'production'
      : 'development'
  );
  app.disable('x-powered-by');

  if (!isProduction) {
    app.use(
      cors({
        origin:
          options.frontendOrigin ??
          'http://localhost:5173',
        methods: [
          'GET',
          'POST',
          'PATCH',
          'DELETE',
        ],
        allowedHeaders: ['Content-Type'],
      })
    );
  }

  app.use(express.json());

  app.use('/api', (_request, response, next) => {
    response.setHeader(
      'Cache-Control',
      'no-store'
    );
    next();
  });

  app.use('/api/petrol', petrolRouter);
  app.use('/api/nest', nestRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/routines', routinesRouter);
  app.use('/api/rewards', rewardsRouter);
  app.use('/api/redemptions', redemptionsRouter);
  app.use('/api/lists', listsRouter);
  app.use('/api/meals', mealsRouter);
  app.use('/api/kumon', kumonRouter);

  app.use('/api', (_request, response) => {
    response.status(404).json({
      error: 'Route not found',
    });
  });

  app.get('/health', (_request, response) => {
    response.setHeader(
      'Cache-Control',
      'no-store'
    );
    response.json({
      status: 'ok',
      service: 'eY OS Server',
      timestamp: new Date().toISOString(),
    });
  });

  if (isProduction) {
    const frontendDistPath =
      options.frontendDistPath ??
      DEFAULT_FRONTEND_DIST_PATH;
    const indexPath =
      assertProductionFrontend(frontendDistPath);
    const assetsPath = join(
      frontendDistPath,
      'assets'
    );

    app.use(
      '/assets',
      express.static(assetsPath, {
        fallthrough: true,
        immutable: true,
        index: false,
        maxAge: '1y',
        setHeaders: response => {
          response.setHeader(
            'Cache-Control',
            IMMUTABLE_CACHE_CONTROL
          );
        },
      })
    );

    app.use('/assets', (_request, response) => {
      response.status(404).json({
        error: 'Route not found',
      });
    });

    const sendApplicationShell = (
      response: Response,
      next: NextFunction
    ) => {
      response.setHeader(
        'Cache-Control',
        INDEX_CACHE_CONTROL
      );
      response.sendFile(
        indexPath,
        error => {
          if (error) next(error);
        }
      );
    };

    app.get(
      '/index.html',
      (_request, response, next) => {
        sendApplicationShell(response, next);
      }
    );

    app.use(
      express.static(frontendDistPath, {
        fallthrough: true,
        index: false,
        setHeaders: response => {
          response.setHeader(
            'Cache-Control',
            REVALIDATE_CACHE_CONTROL
          );
        },
      })
    );

    app.use((request, response, next) => {
      if (
        (
          request.method !== 'GET' &&
          request.method !== 'HEAD'
        ) ||
        !acceptsHtml(request) ||
        extname(request.path) !== ''
      ) {
        next();
        return;
      }

      sendApplicationShell(response, next);
    });
  }

  app.use((_request, response) => {
    response.status(404).json({
      error: 'Route not found',
    });
  });

  app.use(
    (
      error: unknown,
      request: Request,
      response: Response,
      next: NextFunction
    ) => {
      if (response.headersSent) {
        next(error);
        return;
      }

      console.error(
        'eY OS request failed.',
        error
      );

      if (request.path.startsWith('/api')) {
        response.setHeader(
          'Cache-Control',
          'no-store'
        );
        response.status(500).json({
          error: 'Internal server error',
        });
        return;
      }

      response
        .status(500)
        .type('text')
        .send('Unable to serve eY OS.');
    }
  );

  return app;
}
