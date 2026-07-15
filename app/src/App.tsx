import Sidebar from './components/layout/Sidebar'
import './styles/sidebar.css'

function App() {
  return (
    <div className="app-shell">
      <Sidebar />

      <main className="app-content">
        <h1>eY OS</h1>
        <p>React foundation is working.</p>
      </main>
    </div>
  )
}

export default App