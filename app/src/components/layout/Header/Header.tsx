import { useEffect, useRef, useState } from 'react';
import { Bell, CalendarDays, Clock3 } from 'lucide-react';

import SearchBox from '../../ui/SearchBox/SearchBox';
import IconButton from '../../ui/IconButton/IconButton';

import ProfileSwitcher from '../../household/ProfileSwitcher/ProfileSwitcher';
import { MobileMenuButton } from './MobileMenuButton';

import {
  getGreeting,
  getCurrentDate,
  getCurrentTime,
} from '../../../utils/date';
import {
  useHouseholdProfile,
} from '../../../household/useHouseholdProfile';

import './Header.css';

type HeaderProps = {
  isMenuOpen: boolean;
  onMenuToggle: () => void;
};

function Header({
  isMenuOpen,
  onMenuToggle,
}: HeaderProps) {
  const [, setNow] = useState(new Date());
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const wasMenuOpenRef = useRef(false);
  const {
    selectedProfile,
  } = useHouseholdProfile();

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 30000); // Refresh every 30 Secs
  
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (wasMenuOpenRef.current && !isMenuOpen) {
      menuTriggerRef.current?.focus();
    }

    wasMenuOpenRef.current = isMenuOpen;
  }, [isMenuOpen]);
  
  const greeting = getGreeting();
  const currentDate = getCurrentDate();
  const currentTime = getCurrentTime();
  const profileName =
    selectedProfile.displayName;

  return (
    <header className="header">
      <MobileMenuButton
        isMenuOpen={isMenuOpen}
        menuTriggerRef={menuTriggerRef}
        onMenuToggle={onMenuToggle}
      />

      <div className="header__mobile-identity" aria-hidden="true">
        <span>eY</span> OS
      </div>

      <div className="header__greeting">
        <h1>{greeting} {profileName}</h1>
      </div>

      <div className="header__actions">
        <SearchBox placeholder="Search eY OS..." />

        <div className="header__date-time">
          <CalendarDays size={18} />
          <span>{currentDate}</span>

          <Clock3 size={18} />
          <span>{currentTime}</span>
        </div>

        <IconButton
          icon={Bell}
          ariaLabel="Notifications"
        />

        <ProfileSwitcher />
      </div>
    </header>
  );
}

export default Header;
