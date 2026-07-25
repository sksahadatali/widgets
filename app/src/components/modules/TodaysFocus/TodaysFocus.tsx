import {
  CheckCircle2,
  Circle,
  Flag,
} from 'lucide-react';

import Card from '../../ui/Card/Card';
import SectionHeader from '../../ui/SectionHeader/SectionHeader';
import StatusChip from '../../ui/StatusChip/StatusChip';

import './TodaysFocus.css';

type FocusPriority = 'High' | 'Medium' | 'Low';

type FocusItem = {
  id: number;
  title: string;
  completed: boolean;
  priority: FocusPriority;
};

const focusItems: FocusItem[] = [
  {
    id: 1,
    title: 'Complete the eY OS dashboard foundation',
    completed: false,
    priority: 'High',
  },
  {
    id: 2,
    title: 'Review RAEN property opportunities',
    completed: false,
    priority: 'Medium',
  },
  {
    id: 3,
    title: 'Prepare for the upcoming work priorities',
    completed: false,
    priority: 'Low',
  },
];

function getPriorityVariant(
  priority: FocusPriority
): 'danger' | 'warning' | 'info' {
  switch (priority) {
    case 'High':
      return 'danger';

    case 'Medium':
      return 'warning';

    case 'Low':
      return 'info';
  }
}

function TodaysFocus() {
  const completedCount = focusItems.filter(
    (item) => item.completed
  ).length;

  return (
    <Card className="todays-focus">
      <SectionHeader
        eyebrow="Today"
        title="Today's Focus"
        metadata={`${completedCount}/${focusItems.length} completed`}
      />

      <div className="todays-focus__list">
        {focusItems.map((item) => (
          <div
            className={`todays-focus__item ${
              item.completed
                ? 'todays-focus__item--completed'
                : ''
            }`}
            key={item.id}
          >
            <div className="todays-focus__item-main">
              {item.completed ? (
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

              <span className="todays-focus__item-title">
                {item.title}
              </span>
            </div>

            <StatusChip
              label={item.priority}
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