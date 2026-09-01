import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Header from './components/layout/Header/Header';
import Sidebar from './components/layout/Sidebar/Sidebar';

import Home from './pages/Home';
import Daily from './pages/Daily';
import Settings from './pages/Settings';
import Rewards from './pages/Rewards';
import Lists from './pages/Lists';
import Meals from './pages/Meals';

import {
  ThemeProvider,
} from './theme/ThemeContext';
import {
  DisplayProfileProvider,
} from './display/DisplayProfileContext';
import {
  HouseholdProfileProvider,
} from './household/HouseholdProfileContext';
import {
  RoutineProvider,
} from './routines/RoutineProvider';
import {
  RewardProvider,
} from './rewards/RewardProvider';
import {
  AppPageRoutes,
} from './navigation/AppPageRoutes';
import {
  getAppRoute,
  type AppPage,
} from './navigation/appRoutes';

function App() {
  const navigate = useNavigate();
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] =
    useState(false);
  const [dailyRoutineTarget, setDailyRoutineTarget] =
    useState<{
      routineId: string;
      occurrenceId: string;
    } | null>(null);

  const handlePrimaryNavigation = () => {
    setDailyRoutineTarget(null);
    setIsMobileNavigationOpen(false);
  };

  useEffect(() => {
    if (!isMobileNavigationOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileNavigationOpen(false);
      }
    };

    document.body.classList.add('mobile-navigation-open');
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.classList.remove('mobile-navigation-open');
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isMobileNavigationOpen]);

  useEffect(() => {
    const phoneViewport = window.matchMedia(
      '(max-width: 700px)'
    );
    const closeOutsidePhoneViewport = () => {
      if (!phoneViewport.matches) {
        setIsMobileNavigationOpen(false);
      }
    };

    phoneViewport.addEventListener(
      'change',
      closeOutsidePhoneViewport
    );

    return () => {
      phoneViewport.removeEventListener(
        'change',
        closeOutsidePhoneViewport
      );
    };
  }, []);

  const openRoutine = (
    routineId: string,
    occurrenceId: string
  ) => {
    setDailyRoutineTarget({
      routineId,
      occurrenceId,
    });
    navigate(getAppRoute('Daily').path);
  };

  const renderPage = (page: AppPage) => {
    switch (page) {
      case 'Home':
        return (
          <Home onOpenRoutine={openRoutine} />
        );
      case 'Settings':
        return <Settings />;
      case 'Daily':
        return (
          <Daily routineTarget={dailyRoutineTarget} />
        );
      case 'Rewards':
        return <Rewards />;
      case 'Lists':
        return <Lists />;
      case 'Meals':
        return <Meals />;
      case 'Personal':
      case 'RAEN':
      case 'AYANOH':
        return (
          <main className="placeholder-page">
            <h1>{page}</h1>
            <p>
              {page === 'Personal'
                ? 'Coming in Sprint 7.'
                : 'Coming soon.'}
            </p>
          </main>
        );
    }
  };

  return (
    <ThemeProvider>
      <DisplayProfileProvider>
        <HouseholdProfileProvider>
          <RewardProvider>
            <RoutineProvider>
            <div className="app-shell">
              <Sidebar
                isMobileOpen={isMobileNavigationOpen}
                onNavigate={handlePrimaryNavigation}
              />

              {isMobileNavigationOpen && (
                <button
                  type="button"
                  className="mobile-navigation-backdrop"
                  aria-label="Close navigation menu"
                  onClick={() => setIsMobileNavigationOpen(false)}
                />
              )}

              <div
                className="app-main"
                inert={isMobileNavigationOpen ? true : undefined}
              >
                <Header
                  isMenuOpen={isMobileNavigationOpen}
                  onMenuToggle={() =>
                    setIsMobileNavigationOpen(current => !current)
                  }
                />

              <AppPageRoutes renderPage={renderPage} />
              </div>
            </div>
            </RoutineProvider>
          </RewardProvider>
        </HouseholdProfileProvider>
      </DisplayProfileProvider>
    </ThemeProvider>
  );
}

export default App;
