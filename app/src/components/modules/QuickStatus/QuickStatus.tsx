import Card from '../../ui/Card/Card';
import SectionHeader from '../../ui/SectionHeader/SectionHeader';
import StatusChip from '../../ui/StatusChip/StatusChip';

import CalendarCard from './CalendarCard';
import FxCard from './FxCard';
import NestCard from './NestCard';
import PrayerCard from './PrayerCard';
import WeatherCard from './WeatherCard';

import './QuickStatus.css';

function QuickStatus() {
  return (
    <Card className="quick-status">
      <SectionHeader
        title="Quick Status"
        metadata={
          <StatusChip
            label="Live"
            variant="success"
          />
        }
      />

      <div className="quick-status__grid">
        <WeatherCard />
        <PrayerCard />
        <CalendarCard />
        <FxCard />
        <NestCard />
      </div>
    </Card>
  );
}

export default QuickStatus;