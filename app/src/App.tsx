import { useState } from 'react';

import Header from './components/layout/Header/Header';
import Sidebar, {
  type SidebarPage,
} from './components/layout/Sidebar/Sidebar';

import Home from './pages/Home';
import Daily from './pages/Daily';
import Settings from './pages/Settings';

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

function App() {
  const [page, setPage] =
    useState<SidebarPage>('Home');
  const [dailyRoutineTarget, setDailyRoutineTarget] =
    useState<{
      routineId: string;
      occurrenceId: string;
    } | null>(null);

  const navigate = (nextPage: SidebarPage) => {
    setDailyRoutineTarget(null);
    setPage(nextPage);
  };

  const openRoutine = (
    routineId: string,
    occurrenceId: string
  ) => {
    setDailyRoutineTarget({
      routineId,
      occurrenceId,
    });
    setPage('Daily');
  };

  return (
    <ThemeProvider>
      <DisplayProfileProvider>
        <HouseholdProfileProvider>
          <RoutineProvider>
            <div className="app-shell">
              <Sidebar
                page={page}
                onNavigate={navigate}
              />

              <div className="app-main">
                <Header />

              {page === 'Home' && (
                <Home
                  onOpenRoutine={openRoutine}
                />
              )}

              {page === 'Settings' && (
                <Settings />
              )}

              {page === 'Daily' && (
                <Daily
                  routineTarget={dailyRoutineTarget}
                />
              )}

              {page === 'Personal' && (
                <div
                  style={{
                    padding: '48px',
                  }}
                >
                  <h1>Personal</h1>
                  <p>Coming in Sprint 7.</p>
                </div>
              )}

              {page === 'RAEN' && (
                <div
                  style={{
                    padding: '48px',
                  }}
                >
                  <h1>RAEN</h1>
                  <p>Coming soon.</p>
                </div>
              )}

              {page === 'AYANOH' && (
                <div
                  style={{
                    padding: '48px',
                  }}
                >
                  <h1>AYANOH</h1>
                  <p>Coming soon.</p>
                </div>
              )}
              </div>
            </div>
          </RoutineProvider>
        </HouseholdProfileProvider>
      </DisplayProfileProvider>
    </ThemeProvider>
  );
}

export default App;
