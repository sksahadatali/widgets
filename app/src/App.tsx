import Header from './components/layout/Header/Header';
import Sidebar from './components/layout/Sidebar/Sidebar';
import Home from './pages/Home';

function App() {
  return (
    <div className="app-shell">
      <Sidebar />

      <div className="app-main">
        <Header />
        <Home />
      </div>
    </div>
  );
}

export default App;