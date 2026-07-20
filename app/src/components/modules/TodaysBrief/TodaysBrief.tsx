import Card from '../../ui/Card/Card';

import './TodaysBrief.css';

type TodaysBriefProps = {
  title?: string;
  heading?: string;
  summary?: string;
  lastUpdated?: string;
};

function TodaysBrief({
  title = "Today's Brief",
  heading = 'Good morning Sahadat.',
  summary = 'Today looks productive. You have three important priorities and nothing urgent overnight.',
  lastUpdated = '07:00',
}: TodaysBriefProps) {
  return (
    <Card className="todays-brief">
      <div className="todays-brief__header">
        <span className="todays-brief__title">{title}</span>

        <span className="todays-brief__updated">
          Last updated {lastUpdated}
        </span>
      </div>

      <div className="todays-brief__content">
        <h2>{heading}</h2>
        <p>{summary}</p>
      </div>
    </Card>
  );
}

export default TodaysBrief;