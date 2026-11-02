import { AccessError } from './access/householdAccess.js';
import { accessErrorResponse, assertClassifiedRoutes, publicGet, infrastructureUse, inspectIdentityJson, type AccessBoundary } from './access/classifiedRouter.js';
import {
  accessSync,
  constants,
  statSync,
} from 'node:fs';
import {
  extname,
  join,
} from 'node:path';
import cors from 'cors';
import express from 'express';
import type {
  NextFunction,
  Request,
  Response,
} from 'express';

import {
  DEFAULT_FRONTEND_DIST_PATH,
} from './config/frontendBuild.js';

import kumonRouter from './routes/kumon.js';
import listsRouter from './routes/lists.js';
import mealsRouter from './routes/meals.js';
import nestRouter from './routes/nest.js';
import petrolRouter from './routes/petrol.js';
import redemptionsRouter from './routes/redemptions.js';
import rewardsRouter from './routes/rewards.js';
import routinesRouter from './routes/routines.js';
import tasksRouter from './routes/tasks.js';
import calendarRouter from './routes/calendar.js';
import clientConfigRouter from './routes/clientConfig.js';
import prayerTimesRouter from './routes/prayerTimes.js';
import travelRouter from './routes/travel.js';
import weatherRouter from './routes/weather.js';
import { getRuntimeAppMode } from './config/householdConfig.js';
import type { RuntimeAppMode } from './config/runtimeData.js';

export type ServerMode =
  | 'development'
  | 'production';

export type CreateAppOptions = {
  mode: ServerMode;
  accessBoundary?: AccessBoundary;
  appMode?: RuntimeAppMode;
  frontendOrigin?: string;
  frontendDistPath?: string;
};

export { DEFAULT_FRONTEND_DIST_PATH };

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
    infrastructureUse(app,
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

  infrastructureUse(app, express.json({ verify: inspectIdentityJson }));

  infrastructureUse(app, '/api', (_request, response, next) => {
    response.setHeader(
      'Cache-Control',
      'no-store'
    );
    next();
  });

  infrastructureUse(app, '/api', (_request, response, next) => {
    response.locals.accessBoundary = options.accessBoundary ?? { mode: options.appMode ?? getRuntimeAppMode() };
    next();
  });

  infrastructureUse(app, '/api/petrol', petrolRouter);
  infrastructureUse(app, '/api/nest', nestRouter);
  infrastructureUse(app, '/api/tasks', tasksRouter);
  infrastructureUse(app, '/api/routines', routinesRouter);
  infrastructureUse(app, '/api/rewards', rewardsRouter);
  infrastructureUse(app, '/api/redemptions', redemptionsRouter);
  infrastructureUse(app, '/api/lists', listsRouter);
  infrastructureUse(app, '/api/meals', mealsRouter);
  infrastructureUse(app, '/api/kumon', kumonRouter);
  const appMode = options.appMode ?? getRuntimeAppMode();
  infrastructureUse(app, '/api/calendar', calendarRouter);
  infrastructureUse(app, '/api/weather', weatherRouter);
  infrastructureUse(app, '/api/prayer-times', prayerTimesRouter);
  if (appMode === 'household') {
    infrastructureUse(app, '/api/config', clientConfigRouter);
    infrastructureUse(app, '/api/travel', travelRouter);
  }

  infrastructureUse(app, '/api', (_request, response) => {
    response.status(404).json({
      error: 'Route not found',
    });
  });

  publicGet(app, '/health', (_request, response) => {
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

    infrastructureUse(app,
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

    infrastructureUse(app, '/assets', (_request, response) => {
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

    publicGet(app,
      '/index.html',
      (_request, response, next) => {
        sendApplicationShell(response, next);
      }
    );

    infrastructureUse(app,
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

    infrastructureUse(app, (request, response, next) => {
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

  infrastructureUse(app, (_request, response) => {
    response.status(404).json({
      error: 'Route not found',
    });
  });

  infrastructureUse(app,
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

      if (error instanceof AccessError) { accessErrorResponse(error, response); return; }

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

  assertClassifiedRoutes(app);
  return app;
}
