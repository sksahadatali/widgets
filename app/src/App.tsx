import Sidebar from './components/layout/Sidebar/Sidebar'
import Home from './pages/Home'


function App() {
  return (
    <div className="app-shell">
      <Sidebar />
      <Home />
    </div>
  )
}

export default App