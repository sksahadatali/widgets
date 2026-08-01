import {
  Building2,
  CalendarDays,
  Home,
  Plus,
  Quote,
  Settings,
  ShoppingBag,
  User,
} from 'lucide-react';

import './Sidebar.css';

type SidebarPage =
  | 'Home'
  | 'Daily'
  | 'Personal'
  | 'RAEN'
  | 'AYANOH'
  | 'Settings';

type SidebarProps = {
  page: SidebarPage;
  onNavigate: (
    page: SidebarPage
  ) => void;
};

type NavigationItem = {
  label: SidebarPage;
  icon: typeof Home;
};

const navigationItems: NavigationItem[] = [
  {
    label: 'Home',
    icon: Home,
  },
  {
    label: 'Daily',
    icon: CalendarDays,
  },
  {
    label: 'Personal',
    icon: User,
  },
  {
    label: 'RAEN',
    icon: Building2,
  },
  {
    label: 'AYANOH',
    icon: ShoppingBag,
  },
  {
    label: 'Settings',
    icon: Settings,
  },
];

function Sidebar({
  page,
  onNavigate,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <button
        type="button"
        className="sidebar__brand"
        onClick={() => onNavigate('Home')}
        aria-label="Go to Home"
      >
        <div className="sidebar__logo">
          <span className="sidebar__logo-accent">
            eY
          </span>

          <span> OS</span>
        </div>

        <p>Personal Operating System</p>
      </button>

      <div className="sidebar__divider" />

      <nav
        className="sidebar__nav"
        aria-label="Primary navigation"
      >
        {navigationItems.map(item => {
          const isActive =
            page === item.label;

          const Icon = item.icon;

          return (
            <button
              key={item.label}
              type="button"
              className={`sidebar__nav-item ${
                isActive
                  ? 'sidebar__nav-item--active'
                  : ''
              }`}
              onClick={() =>
                onNavigate(item.label)
              }
              aria-current={
                isActive
                  ? 'page'
                  : undefined
              }
            >
              {isActive && (
                <span
                  className="sidebar__active-indicator"
                  aria-hidden="true"
                />
              )}

              <Icon
                size={20}
                strokeWidth={2}
                className="sidebar__nav-icon"
                aria-hidden="true"
              />

              <span className="sidebar__nav-label">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar__bottom">
        <div className="sidebar__reflection">
          <Quote
            size={20}
            strokeWidth={2}
            className="sidebar__reflection-icon"
            aria-hidden="true"
          />

          <p className="sidebar__reflection-text">
            And put your trust in Allah,
            and sufficient is Allah as
            Disposer of affairs.
          </p>

          <span className="sidebar__reflection-source">
            Quran 33:3
          </span>
        </div>

        <button
          type="button"
          className="sidebar__quick-add"
        >
          <span>Quick Add</span>

          <Plus
            size={20}
            strokeWidth={2}
            aria-hidden="true"
          />
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;

export type {
  SidebarPage,
};