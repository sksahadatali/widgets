import { useState } from 'react';

import Header from './components/layout/Header/Header';
import Sidebar, {
  type SidebarPage,
} from './components/layout/Sidebar/Sidebar';

import Home from './pages/Home';
import Settings from './pages/Settings';

import {
  ThemeProvider,
} from './theme/ThemeContext';
import {
  DisplayProfileProvider,
} from './display/DisplayProfileContext';

function App() {
  const [page, setPage] =
    useState<SidebarPage>('Home');

  return (
    <ThemeProvider>
      <DisplayProfileProvider>
        <div className="app-shell">
          <Sidebar
            page={page}
            onNavigate={setPage}
          />

          <div className="app-main">
            <Header />

            {page === 'Home' && (
              <Home />
            )}

            {page === 'Settings' && (
              <Settings />
            )}

            {page === 'Daily' && (
              <div
                style={{
                  padding: '48px',
                }}
              >
                <h1>Daily</h1>
                <p>Coming in Sprint 6.</p>
              </div>
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
      </DisplayProfileProvider>
    </ThemeProvider>
  );
}

export default App;
