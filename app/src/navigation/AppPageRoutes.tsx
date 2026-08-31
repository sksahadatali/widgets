import {
  type ReactNode,
} from 'react';
import {
  Route,
  Routes,
} from 'react-router-dom';

import {
  APP_ROUTES,
  type AppPage,
} from './appRoutes';

type AppPageRoutesProps = {
  renderPage: (page: AppPage) => ReactNode;
};

export function AppPageRoutes({
  renderPage,
}: AppPageRoutesProps) {
  return (
    <Routes>
      {APP_ROUTES.map(route => (
        <Route
          key={route.path}
          path={route.path}
          element={renderPage(route.page)}
        />
      ))}
      <Route path="*" element={renderPage('Home')} />
    </Routes>
  );
}
