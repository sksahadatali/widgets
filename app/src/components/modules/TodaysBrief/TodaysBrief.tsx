import Card from '../../ui/Card/Card';
import SectionHeader from '../../ui/SectionHeader/SectionHeader';

import { useTodaysBrief } from '../../../hooks/useTodaysBrief';

import './TodaysBrief.css';

function TodaysBrief() {
  const {
    brief,
    loading,
    hasError,
  } = useTodaysBrief();

  return (
    <Card className="todays-brief">
      <SectionHeader
        title="Today's Brief"
        metadata={
          loading
            ? 'Updating...'
            : `Last updated ${brief.updatedAt}`
        }
      />

      <div className="todays-brief__content">
        <h2>
          {loading && brief.items.length === 0
            ? 'Preparing your brief...'
            : brief.heading}
        </h2>

        {brief.items.length > 0 ? (
          <ul className="todays-brief__list">
            {brief.items.map(
              (item, index) => (
                <li key={`${index}-${item}`}>
                  {item}
                </li>
              )
            )}
          </ul>
        ) : !loading ? (
          <p>
            Today's information is currently
            unavailable.
          </p>
        ) : null}

        {hasError && brief.items.length > 0 && (
          <span className="todays-brief__notice">
            Some information could not be updated.
          </span>
        )}
      </div>
    </Card>
  );
}

export default TodaysBrief;