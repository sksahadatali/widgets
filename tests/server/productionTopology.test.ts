import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import type {
  Server,
} from 'node:http';
import {
  isAbsolute,
  join,
} from 'node:path';
import {
  tmpdir,
} from 'node:os';
import {
  after,
  before,
  describe,
  it,
} from 'node:test';

const REQUIRED_TEST_ENV = {
  NEST_CLIENT_ID: 'synthetic-client-id',
  NEST_CLIENT_SECRET: 'synthetic-client-secret',
  NEST_REFRESH_TOKEN: 'synthetic-refresh-token',
  NEST_PROJECT_ID: 'synthetic-project-id',
  NEST_DEVICE_NAME: 'synthetic-device-name',
  NOTION_TOKEN: 'synthetic-notion-token',
  NOTION_TASKS_DATA_SOURCE_ID:
    'synthetic-tasks-data-source-id',
};

Object.entries(REQUIRED_TEST_ENV).forEach(
  ([name, value]) => {
    process.env[name] ??= value;
  }
);

let directory = '';
let server: Server;
let baseUrl = '';
let createApp: typeof import(
  '../../server/src/app.js'
).createApp;
let defaultFrontendDistPath = '';

async function createFrontendFixture(): Promise<string> {
  const frontendDistPath = await mkdtemp(
    join(tmpdir(), 'ey-production-topology-')
  );
  const assetsPath = join(
    frontendDistPath,
    'assets'
  );

  await mkdir(assetsPath);
  await Promise.all([
    writeFile(
      join(frontendDistPath, 'index.html'),
      '<!doctype html><html><body>eY OS test application</body></html>',
      'utf8'
    ),
    writeFile(
      join(frontendDistPath, 'favicon.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
      'utf8'
    ),
    writeFile(
      join(frontendDistPath, 'icons.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
      'utf8'
    ),
    writeFile(
      join(assetsPath, 'app-testhash.js'),
      'globalThis.eyOsTest = true;',
      'utf8'
    ),
  ]);

  return frontendDistPath;
}

async function request(
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, init);
}

before(async () => {
  const appModule =
    await import('../../server/src/app.js');
  createApp = appModule.createApp;
  defaultFrontendDistPath =
    appModule.DEFAULT_FRONTEND_DIST_PATH;
  directory = await createFrontendFixture();
  const app = createApp({
    mode: 'production',
    frontendDistPath: directory,
  });

  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, '127.0.0.1');
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  assert.ok(
    address && typeof address !== 'string'
  );
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  if (directory) {
    await rm(directory, {
      recursive: true,
      force: true,
    });
  }
});

describe('production frontend startup', () => {
  it('uses a repository-relative absolute default path', () => {
    assert.equal(
      isAbsolute(defaultFrontendDistPath),
      true
    );
    assert.equal(
      defaultFrontendDistPath
        .replace(/[\\/]+$/, '')
        .endsWith(join('app', 'dist')),
      true
    );
  });

  it('fails clearly when the frontend directory is missing', () => {
    assert.throws(
      () => createApp({
        mode: 'production',
        frontendDistPath: join(
          tmpdir(),
          'ey-missing-production-build'
        ),
      }),
      /Production frontend build is missing/
    );
  });

  it('fails clearly when index.html is missing', async () => {
    const emptyDirectory = await mkdtemp(
      join(tmpdir(), 'ey-empty-production-build-')
    );

    try {
      assert.throws(
        () => createApp({
          mode: 'production',
          frontendDistPath: emptyDirectory,
        }),
        /Production frontend build is missing/
      );
    } finally {
      await rm(emptyDirectory, {
        recursive: true,
        force: true,
      });
    }
  });
});

describe('production frontend routing', () => {
  for (const path of [
    '/',
    '/daily',
    '/rewards',
    '/lists',
    '/meals',
    '/settings',
    '/future-client-route',
    '/index.html',
  ]) {
    it(`serves the application shell for ${path}`, async () => {
      const response = await request(path, {
        headers: {
          Accept: 'text/html',
        },
      });

      assert.equal(response.status, 200);
      assert.match(
        response.headers.get('content-type') ?? '',
        /^text\/html/
      );
      assert.equal(
        response.headers.get('cache-control'),
        'no-cache, must-revalidate'
      );
      assert.match(
        await response.text(),
        /eY OS test application/
      );
    });
  }

  it('supports HEAD navigation without a response body', async () => {
    const response = await request('/daily', {
      method: 'HEAD',
      headers: {
        Accept: 'text/html',
      },
    });

    assert.equal(response.status, 200);
    assert.equal(await response.text(), '');
  });

  it('does not use the application shell for non-HTML requests', async () => {
    const response = await request('/missing.json', {
      headers: {
        Accept: 'application/json',
      },
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: 'Route not found',
    });
  });

  it('does not use the application shell for a missing file', async () => {
    const response = await request('/missing.js', {
      headers: {
        Accept: 'text/html',
      },
    });

    assert.equal(response.status, 404);
    assert.doesNotMatch(
      await response.text(),
      /eY OS test application/
    );
  });
});

describe('production static assets', () => {
  it('serves hashed assets with immutable caching', async () => {
    const response = await request(
      '/assets/app-testhash.js'
    );

    assert.equal(response.status, 200);
    assert.match(
      response.headers.get('content-type') ?? '',
      /javascript/
    );
    assert.equal(
      response.headers.get('cache-control'),
      'public, max-age=31536000, immutable'
    );
  });

  it('returns a non-HTML 404 for a missing hashed asset', async () => {
    const response = await request(
      '/assets/missing-testhash.js',
      {
        headers: {
          Accept: 'text/html',
        },
      }
    );

    assert.equal(response.status, 404);
    assert.match(
      response.headers.get('content-type') ?? '',
      /^application\/json/
    );
    assert.doesNotMatch(
      await response.text(),
      /eY OS test application/
    );
  });

  for (const path of ['/favicon.svg', '/icons.svg']) {
    it(`revalidates the non-hashed asset ${path}`, async () => {
      const response = await request(path);

      assert.equal(response.status, 200);
      assert.match(
        response.headers.get('content-type') ?? '',
        /^image\/svg\+xml/
      );
      assert.equal(
        response.headers.get('cache-control'),
        'public, max-age=0, must-revalidate'
      );
    });
  }
});

describe('API and health precedence', () => {
  it('routes an existing API request before frontend handling', async () => {
    const response = await request('/api/meals', {
      headers: {
        Accept: 'text/html',
      },
    });

    assert.equal(response.status, 400);
    assert.match(
      response.headers.get('content-type') ?? '',
      /^application\/json/
    );
    assert.equal(
      response.headers.get('cache-control'),
      'no-store'
    );
    assert.equal(
      (await response.json() as { success: boolean }).success,
      false
    );
  });

  for (const path of ['/api', '/api/unknown/nested']) {
    it(`returns JSON for the unknown API path ${path}`, async () => {
      const response = await request(path, {
        headers: {
          Accept: 'text/html',
        },
      });

      assert.equal(response.status, 404);
      assert.equal(
        response.headers.get('cache-control'),
        'no-store'
      );
      assert.match(
        response.headers.get('content-type') ?? '',
        /^application\/json/
      );
      assert.deepEqual(await response.json(), {
        error: 'Route not found',
      });
    });
  }

  it('returns JSON for unknown non-GET API methods', async () => {
    const response = await request('/api/unknown', {
      method: 'DELETE',
      headers: {
        Accept: 'text/html',
      },
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: 'Route not found',
    });
  });

  it('preserves the JSON health contract', async () => {
    const response = await request('/health', {
      headers: {
        Accept: 'text/html',
      },
    });
    const body = await response.json() as {
      status: string;
      service: string;
      timestamp: string;
    };

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get('cache-control'),
      'no-store'
    );
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'eY OS Server');
    assert.equal(
      new Date(body.timestamp).toISOString(),
      body.timestamp
    );
  });

  it('does not emit a CORS header in production', async () => {
    const response = await request('/health', {
      headers: {
        Origin: 'http://localhost:5173',
      },
    });

    assert.equal(
      response.headers.get('access-control-allow-origin'),
      null
    );
  });

  it('does not add CORS for a same-origin LAN deployment', async () => {
    const response = await request('/health', {
      headers: {
        Origin: 'http://192.168.1.20:3001',
      },
    });

    assert.equal(
      response.headers.get('access-control-allow-origin'),
      null
    );
  });
});

describe('development CORS', () => {
  it('retains the configured development origin', async () => {
    const developmentApp = createApp({
      mode: 'development',
      frontendOrigin: 'http://localhost:5173',
    });
    let developmentServer: Server | undefined;

    try {
      await new Promise<void>((resolve, reject) => {
        developmentServer = developmentApp.listen(
          0,
          '127.0.0.1'
        );
        developmentServer.once('listening', resolve);
        developmentServer.once('error', reject);
      });
      const address = developmentServer.address();
      assert.ok(
        address && typeof address !== 'string'
      );
      const response = await fetch(
        `http://127.0.0.1:${address.port}/health`,
        {
          headers: {
            Origin: 'http://localhost:5173',
          },
        }
      );

      assert.equal(
        response.headers.get(
          'access-control-allow-origin'
        ),
        'http://localhost:5173'
      );
    } finally {
      if (developmentServer) {
        await new Promise<void>((resolve, reject) => {
          developmentServer?.close(error => {
            if (error) reject(error);
            else resolve();
          });
        });
      }
    }
  });
});
