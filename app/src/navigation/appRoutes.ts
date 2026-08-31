export type AppPage =
  | 'Home'
  | 'Daily'
  | 'Rewards'
  | 'Lists'
  | 'Meals'
  | 'Personal'
  | 'RAEN'
  | 'AYANOH'
  | 'Settings';

export type AppRoute = {
  page: AppPage;
  path: string;
};

export const APP_ROUTES: readonly AppRoute[] = [
  { page: 'Home', path: '/' },
  { page: 'Daily', path: '/daily' },
  { page: 'Rewards', path: '/rewards' },
  { page: 'Lists', path: '/lists' },
  { page: 'Meals', path: '/meals' },
  { page: 'Personal', path: '/personal' },
  { page: 'RAEN', path: '/raen' },
  { page: 'AYANOH', path: '/ayanoh' },
  { page: 'Settings', path: '/settings' },
];

export function getAppRoute(page: AppPage): AppRoute {
  const route = APP_ROUTES.find(
    candidate => candidate.page === page
  );

  if (!route) {
    throw new Error(`Unknown eY OS page: ${page}`);
  }

  return route;
}

export function getNavigationItemClassName(
  isActive: boolean
): string {
  return `sidebar__nav-item ${
    isActive
      ? 'sidebar__nav-item--active'
      : ''
  }`;
}
