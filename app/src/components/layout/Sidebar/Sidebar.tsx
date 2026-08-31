import {
  Building2,
  CalendarDays,
  Home,
  Gift,
  ListChecks,
  Plus,
  Quote,
  Settings,
  ShoppingBag,
  Utensils,
  User,
} from 'lucide-react';
import {
  NavLink,
} from 'react-router-dom';

import {
  getAppRoute,
  getNavigationItemClassName,
  type AppPage,
} from '../../../navigation/appRoutes';

import './Sidebar.css';

type SidebarProps = {
  onNavigate?: () => void;
};

type NavigationItem = {
  label: AppPage;
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
    label: 'Rewards',
    icon: Gift,
  },
  {
    label: 'Lists',
    icon: ListChecks,
  },
  {
    label: 'Meals',
    icon: Utensils,
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
  onNavigate,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <NavLink
        to={getAppRoute('Home').path}
        end
        className="sidebar__brand"
        onClick={onNavigate}
        aria-label="Go to Home"
      >
        <div className="sidebar__logo">
          <span className="sidebar__logo-accent">
            eY
          </span>

          <span> OS</span>
        </div>

        <p>Personal Operating System</p>
      </NavLink>

      <div className="sidebar__divider" />

      <nav
        className="sidebar__nav"
        aria-label="Primary navigation"
      >
        {navigationItems.map(item => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.label}
              to={getAppRoute(item.label).path}
              end={item.label === 'Home'}
              className={({ isActive }) =>
                getNavigationItemClassName(isActive)
              }
              onClick={onNavigate}
            >
              {({ isActive }) => (
                <>
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
                </>
              )}
            </NavLink>
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
  AppPage as SidebarPage,
};
