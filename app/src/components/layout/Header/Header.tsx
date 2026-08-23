import { useEffect, useState } from 'react';
import { Bell, CalendarDays, Clock3 } from 'lucide-react';

import SearchBox from '../../ui/SearchBox/SearchBox';
import IconButton from '../../ui/IconButton/IconButton';

import Avatar from '../../ui/Avatar/Avatar';

import {
  getGreeting,
  getCurrentDate,
  getCurrentTime,
} from '../../../utils/date';

import './Header.css';

function Header() {
  const [, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 30000); // Refresh every 30 Secs
  
    return () => clearInterval(timer);
  }, []);
  
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
          <CalendarDays size={18} />
          <span>{currentDate}</span>

          <Clock3 size={18} />
          <span>{currentTime}</span>
        </div>

        <IconButton
          icon={Bell}
          ariaLabel="Notifications"
        />

        <Avatar
          name="Sahadat Ali"
        />
      </div>
    </header>
  );
}

export default Header;