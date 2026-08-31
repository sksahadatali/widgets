import assert from 'node:assert/strict';
import {
  readFile,
  readdir,
} from 'node:fs/promises';
import test from 'node:test';
import {
  createElement,
} from 'react';
import {
  renderToStaticMarkup,
} from 'react-dom/server';
import {
  createMemoryRouter,
  MemoryRouter,
} from 'react-router-dom';

import {
  AppPageRoutes,
} from '../../app/src/navigation/AppPageRoutes';
import {
  APP_ROUTES,
  getNavigationItemClassName,
  type AppPage,
} from '../../app/src/navigation/appRoutes';
import {
  resolveApiUrl,
} from '../../app/src/services/clientApi';

function renderRoute(path: string): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(AppPageRoutes, {
        renderPage: (page: AppPage) =>
          createElement(
            'main',
            { 'data-page': page },
            page
          ),
      })
    )
  );
}

test('client API addressing', async t => {
  await t.test(
    'uses same-origin relative API paths by default',
    () => {
      assert.equal(
        resolveApiUrl('/api/lists'),
        '/api/lists'
      );
    }
  );

  await t.test(
    'joins configured bases without malformed slashes',
    () => {
      assert.equal(
        resolveApiUrl(
          '/api/meals',
          'http://localhost:3001/'
        ),
        'http://localhost:3001/api/meals'
      );
      assert.equal(
        resolveApiUrl('/api', '/gateway///'),
        '/gateway/api'
      );
    }
  );

  await t.test(
    'rejects paths outside the eY OS API boundary',
    () => {
      assert.throws(
        () => resolveApiUrl('/calendar'),
        /must start with \/api/
      );
    }
  );

  await t.test(
    'keeps backend origins out of domain source files',
    async () => {
      const sourceDirectories = [
        new URL('../../app/src/services/', import.meta.url),
        new URL('../../app/src/hooks/', import.meta.url),
      ];

      for (const directory of sourceDirectories) {
        const entries = await readdir(directory, {
          withFileTypes: true,
        });

        for (const entry of entries) {
          if (
            !entry.isFile() ||
            !/\.tsx?$/.test(entry.name)
          ) {
            continue;
          }

          const source = await readFile(
            new URL(entry.name, directory),
            'utf8'
          );

          assert.equal(
            source.includes('localhost:3001'),
            false,
            `${entry.name} must use the centralized API resolver.`
          );
        }
      }
    }
  );
});

test('primary destination routing', async t => {
  const expectedRoutes: ReadonlyArray<
    readonly [AppPage, string]
  > = [
    ['Home', '/'],
    ['Daily', '/daily'],
    ['Rewards', '/rewards'],
    ['Lists', '/lists'],
    ['Meals', '/meals'],
    ['Personal', '/personal'],
    ['RAEN', '/raen'],
    ['AYANOH', '/ayanoh'],
    ['Settings', '/settings'],
  ];

  assert.deepEqual(
    APP_ROUTES.map(route => [route.page, route.path]),
    expectedRoutes
  );

  for (const [page, path] of expectedRoutes) {
    await t.test(
      `${path} renders ${page}`,
      () => {
        assert.match(
          renderRoute(path),
          new RegExp(`data-page="${page}"`)
        );
      }
    );
  }

  await t.test(
    'an unknown deep link falls back to Home',
    () => {
      assert.match(
        renderRoute('/unsupported'),
        /data-page="Home"/
      );
    }
  );

  await t.test(
    'Back and Forward traverse primary destination history',
    async () => {
      const router = createMemoryRouter(
        APP_ROUTES.map(route => ({
          path: route.path,
          element: createElement('main', null, route.page),
        })),
        {
          initialEntries: ['/', '/lists'],
          initialIndex: 1,
        }
      );

      await router.navigate('/meals');
      assert.equal(router.state.location.pathname, '/meals');

      await router.navigate(-1);
      assert.equal(router.state.location.pathname, '/lists');

      await router.navigate(-1);
      assert.equal(router.state.location.pathname, '/');

      await router.navigate(1);
      assert.equal(router.state.location.pathname, '/lists');
    }
  );

  await t.test(
    'active navigation state preserves the Sidebar class',
    () => {
      assert.equal(
        getNavigationItemClassName(true),
        'sidebar__nav-item sidebar__nav-item--active'
      );
      assert.equal(
        getNavigationItemClassName(false),
        'sidebar__nav-item '
      );
    }
  );
});
