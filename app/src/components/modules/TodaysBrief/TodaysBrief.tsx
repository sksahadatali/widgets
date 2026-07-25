import Card from '../../ui/Card/Card';
import SectionHeader from '../../ui/SectionHeader/SectionHeader';

import './TodaysBrief.css';

type TodaysBriefProps = {
  title?: string;
  heading?: string;
  summary?: string;
  lastUpdated?: string;
};

function TodaysBrief({
  title = "Today's Brief",
  heading = 'Today looks productive.',
  summary = 'You have three important priorities and nothing urgent overnight.',
  lastUpdated = '07:00',
}: TodaysBriefProps) {
  return (
    <Card className="todays-brief">
      <SectionHeader
        title={title}
        metadata={`Last updated ${lastUpdated}`}
      />

      <div className="todays-brief__content">
        <h2>{heading}</h2>
        <p>{summary}</p>
      </div>
    </Card>
  );
}

export default TodaysBrief;