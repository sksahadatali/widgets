import Header from './components/layout/Header/Header';
import Sidebar from './components/layout/Sidebar/Sidebar';
import Home from './pages/Home';

import {
  ThemeProvider,
} from './theme/ThemeContext';

function App() {
  return (
    <ThemeProvider>
      <div className="app-shell">
        <Sidebar />

        <div className="app-main">
          <Header />
          <Home />
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;