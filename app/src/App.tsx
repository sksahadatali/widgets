import { useState } from 'react';
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
  const [dailyRoutineTarget, setDailyRoutineTarget] =
    useState<{
      routineId: string;
      occurrenceId: string;
    } | null>(null);

  const handlePrimaryNavigation = () => {
    setDailyRoutineTarget(null);
  };

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
          <div style={{ padding: '48px' }}>
            <h1>{page}</h1>
            <p>
              {page === 'Personal'
                ? 'Coming in Sprint 7.'
                : 'Coming soon.'}
            </p>
          </div>
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
                onNavigate={handlePrimaryNavigation}
              />

              <div className="app-main">
                <Header />

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
