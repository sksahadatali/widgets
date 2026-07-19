import { Bell, CalendarDays, Clock3 } from 'lucide-react';

import SearchBox from '../../ui/SearchBox/SearchBox';
import IconButton from '../../ui/IconButton/IconButton';

import {
  getGreeting,
  getCurrentDate,
  getCurrentTime,
} from '../../../utils/date';

import './Header.css';

function Header() {
  const greeting = getGreeting();
  const currentDate = getCurrentDate();
  const currentTime = getCurrentTime();

  return (
    <header className="header">
      <div className="header__greeting">
        <h1>{greeting} Sahadat</h1>
      </div>

      <div className="header__actions">
        <SearchBox placeholder="Search eY OS..." />

        <div className="header__date-time">
          <CalendarDays size={18} strokeWidth={2} />
          <span>{currentDate}</span>

          <Clock3 size={18} strokeWidth={2} />
          <span>{currentTime}</span>
        </div>

        <IconButton
          icon={Bell}
          ariaLabel="Notifications"
        />
      </div>
    </header>
  );
}

export default Header;