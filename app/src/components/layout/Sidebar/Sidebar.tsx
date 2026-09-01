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
  useEffect,
  useRef,
} from 'react';

import {
  APP_ROUTES,
  getAppRoute,
  getNavigationItemClassName,
  type AppPage,
} from '../../../navigation/appRoutes';
import {
  createNavigationSelectionHandler,
} from '../../../navigation/mobileNavigation';

import './Sidebar.css';

type SidebarProps = {
  isMobileOpen?: boolean;
  onNavigate?: () => void;
};

type NavigationItem = {
  label: AppPage;
  icon: typeof Home;
};

const navigationIcons: Record<AppPage, typeof Home> = {
  Home,
  Daily: CalendarDays,
  Rewards: Gift,
  Lists: ListChecks,
  Meals: Utensils,
  Personal: User,
  RAEN: Building2,
  AYANOH: ShoppingBag,
  Settings,
};

const navigationItems: NavigationItem[] =
  APP_ROUTES.map(route => ({
    label: route.page,
    icon: navigationIcons[route.page],
  }));

function Sidebar({
  isMobileOpen = false,
  onNavigate,
}: SidebarProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const handleNavigationSelection =
    createNavigationSelectionHandler(onNavigate);

  useEffect(() => {
    if (!isMobileOpen) return;

    drawerRef.current
      ?.querySelector<HTMLElement>(
        '.sidebar__nav-item--active, .sidebar__nav-item'
      )
      ?.focus();
  }, [isMobileOpen]);

  return (
    <aside
      ref={drawerRef}
      id="primary-navigation-drawer"
      className={`sidebar ${
        isMobileOpen ? 'sidebar--mobile-open' : ''
      }`}
      role={isMobileOpen ? 'dialog' : undefined}
      aria-modal={isMobileOpen ? true : undefined}
      aria-label="eY OS navigation"
    >
      <NavLink
        to={getAppRoute('Home').path}
        end
        className="sidebar__brand"
        onClick={handleNavigationSelection}
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
              onClick={handleNavigationSelection}
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
