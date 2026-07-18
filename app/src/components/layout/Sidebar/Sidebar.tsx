import './Sidebar.css'

const navigationItems = [
  { label: 'Home', active: true },
  { label: 'Daily' },
  { label: 'Personal' },
  { label: 'RAEN' },
  { label: 'AYANOH' },
  { label: 'Settings' },
]

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__logo">
          <span className="sidebar__logo-accent">eY</span>
          <span> OS</span>
        </div>
        <p>Personal Operating System</p>
      </div>

      <div className="sidebar__divider" />

      <nav className="sidebar__nav" aria-label="Primary navigation">
        {navigationItems.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`sidebar__nav-item ${
              item.active ? 'sidebar__nav-item--active' : ''
            }`}
          >
            {item.active && <span className="sidebar__active-indicator" />}
            <span className="sidebar__nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}

export default Sidebar