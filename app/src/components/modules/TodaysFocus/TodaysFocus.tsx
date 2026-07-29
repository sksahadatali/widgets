import {
  CheckCircle2,
  Circle,
  Flag,
} from 'lucide-react';

import Card from '../../ui/Card/Card';
import SectionHeader from '../../ui/SectionHeader/SectionHeader';
import StatusChip from '../../ui/StatusChip/StatusChip';

import { useFocus } from '../../../hooks/useFocus';
import type { FocusPriority } from '../../../types/focus';

import './TodaysFocus.css';

function getPriorityVariant(
  priority: FocusPriority
): 'danger' | 'warning' | 'info' {
  switch (priority) {
    case 'high':
      return 'danger';

    case 'medium':
      return 'warning';

    case 'low':
      return 'info';
  }
}

function TodaysFocus() {
  const { items, loading, error } = useFocus();

  const completedCount = items.filter(
    (item) => item.status === 'completed'
  ).length;

  if (loading) {
    return (
      <Card className="todays-focus">
        <SectionHeader
          eyebrow="Today"
          title="Today's Focus"
          metadata="Loading..."
        />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="todays-focus">
        <SectionHeader
          eyebrow="Today"
          title="Today's Focus"
          metadata="Unavailable"
        />
      </Card>
    );
  }

  return (
    <Card className="todays-focus">
      <SectionHeader
        eyebrow="Today"
        title="Today's Focus"
        metadata={`${completedCount}/${items.length} completed`}
      />

      <div className="todays-focus__list">
        {items.map((item) => (
          <div
            className={`todays-focus__item ${
              item.status === 'completed'
                ? 'todays-focus__item--completed'
                : ''
            }`}
            key={item.id}
          >
            <div className="todays-focus__item-main">
              {item.status === 'completed' ? (
                <CheckCircle2
                  size={20}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              ) : (
                <Circle
                  size={20}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              )}

              <div className="todays-focus__text">
                <span className="todays-focus__item-title">
                  {item.title}
                </span>

                {item.estimatedMinutes && (
                  <span className="todays-focus__item-duration">
                    ~ {item.estimatedMinutes} mins
                  </span>
                )}
              </div>
            </div>

            <StatusChip
              label={
                item.priority.charAt(0).toUpperCase() +
                item.priority.slice(1)
              }
              variant={getPriorityVariant(item.priority)}
              icon={
                <Flag
                  size={14}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              }
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

export default TodaysFocus;