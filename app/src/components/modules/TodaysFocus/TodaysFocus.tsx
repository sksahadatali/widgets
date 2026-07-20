import { CheckCircle2, Circle } from 'lucide-react';

import Card from '../../ui/Card/Card';

import './TodaysFocus.css';

type FocusItem = {
  id: number;
  title: string;
  completed: boolean;
};

const focusItems: FocusItem[] = [
  {
    id: 1,
    title: 'Complete the eY OS dashboard foundation',
    completed: false,
  },
  {
    id: 2,
    title: 'Review RAEN property opportunities',
    completed: false,
  },
  {
    id: 3,
    title: 'Prepare for the upcoming work priorities',
    completed: false,
  },
];

function TodaysFocus() {
  return (
    <Card className="todays-focus">
      <div className="todays-focus__header">
        <div>
          <span className="todays-focus__eyebrow">Today</span>
          <h2>Today&apos;s Focus</h2>
        </div>

        <span className="todays-focus__count">
          {focusItems.filter((item) => item.completed).length}/
          {focusItems.length} completed
        </span>
      </div>

      <div className="todays-focus__list">
        {focusItems.map((item) => (
          <div
            className={`todays-focus__item ${
              item.completed ? 'todays-focus__item--completed' : ''
            }`}
            key={item.id}
          >
            {item.completed ? (
              <CheckCircle2 size={20} strokeWidth={2} />
            ) : (
              <Circle size={20} strokeWidth={2} />
            )}

            <span>{item.title}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default TodaysFocus;