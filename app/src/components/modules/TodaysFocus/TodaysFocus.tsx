import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock3,
  Flag,
  Target
} from 'lucide-react';

import {
  useState,
} from 'react';

import Card from '../../ui/Card/Card';
import SectionHeader from '../../ui/SectionHeader/SectionHeader';
import StatusChip from '../../ui/StatusChip/StatusChip';

import { useFocus } from '../../../hooks/useFocus';

import type {
  FocusPriority,
} from '../../../types/focus';

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

type TodaysFocusProps = {
  onOpenRoutine: (
    routineId: string,
    occurrenceId: string
  ) => void;
};

function TodaysFocus({
  onOpenRoutine,
}: TodaysFocusProps) {
  const {
    brain,
    loading,
    error,
  } = useFocus();

  const [
    expandedDecisionId,
    setExpandedDecisionId,
  ] = useState<string | null>(
    null
  );

  const decisions =
    brain?.decisions ?? [];

  const completedCount =
    decisions.filter(
      decision =>
        decision.item.status ===
        'completed'
    ).length;

  function toggleExplanation(
    decisionId: string
  ) {
    setExpandedDecisionId(
      currentId =>
        currentId === decisionId
          ? null
          : decisionId
    );
  }

  if (loading) {
    return (
      <Card className="todays-focus">
        <SectionHeader
          icon={Target}
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
          icon={Target}
          title="Today's Focus"
          metadata="Unavailable"
        />
      </Card>
    );
  }

  return (
    <Card className="todays-focus">
      <SectionHeader
        icon={Target}
        title="Today's Focus"
        metadata={`${completedCount}/${decisions.length} completed`}
      />

      <div className="todays-focus__list">
        {decisions.map(
          decision => {
            const {
              item,
              reasons,
              presentation,
              action,
            } = decision;

            const isExpanded =
              expandedDecisionId ===
              item.id;

            const itemMainContent = (
              <>
                {item.status ===
                'completed' ? (
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
                  <span
                    className="todays-focus__item-title"
                    title={item.title}
                  >
                    {item.title}
                  </span>

                  <div className="todays-focus__item-meta">
                    {presentation ? (
                      <span className="todays-focus__routine-meta">
                        {presentation.metadata.join(' · ')}
                      </span>
                    ) : (
                      <>
                        {item.estimatedMinutes !==
                          null && (
                          <span className="todays-focus__item-duration">
                            ~{' '}
                            {
                              item.estimatedMinutes
                            }{' '}
                            mins
                          </span>
                        )}

                        <span className="todays-focus__item-source">
                          {
                            decision.source
                          }
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </>
            );

            return (
              <div
                className={`todays-focus__item-wrapper ${
                  item.status ===
                  'completed'
                    ? 'todays-focus__item-wrapper--completed'
                    : ''
                }`}
                key={item.id}
              >
                <div className="todays-focus__item">
                  {action?.type === 'open-routine' ? (
                    <button
                      type="button"
                      className="todays-focus__item-main todays-focus__item-link"
                      aria-label={`Open ${item.title} in Daily`}
                      onClick={() =>
                        onOpenRoutine(
                          action.routineId,
                          action.occurrenceId
                        )
                      }
                    >
                      {itemMainContent}
                    </button>
                  ) : (
                    <div className="todays-focus__item-main">
                      {itemMainContent}
                    </div>
                  )}

                  <div className="todays-focus__actions">
                    <StatusChip
                      label={
                        presentation?.statusLabel ??
                        (
                          item.priority
                            .charAt(0)
                            .toUpperCase() +
                          item.priority.slice(
                            1
                          )
                        )
                      }
                      variant={
                        presentation?.chipVariant ??
                        getPriorityVariant(
                          item.priority
                        )
                      }
                      icon={
                        presentation ? (
                          <Clock3
                            size={14}
                            strokeWidth={2}
                            aria-hidden="true"
                          />
                        ) : (
                          <Flag
                          size={14}
                          strokeWidth={2}
                          aria-hidden="true"
                          />
                        )
                      }
                    />

                    {reasons.length >
                      0 && (
                      <button
                        type="button"
                        className="todays-focus__why-button"
                        aria-expanded={
                          isExpanded
                        }
                        aria-controls={`focus-reasons-${item.id}`}
                        onClick={() =>
                          toggleExplanation(
                            item.id
                          )
                        }
                      >
                        Why?

                        {isExpanded ? (
                          <ChevronUp
                            size={15}
                            aria-hidden="true"
                          />
                        ) : (
                          <ChevronDown
                            size={15}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div
                    id={`focus-reasons-${item.id}`}
                    className="todays-focus__reasons"
                  >
                    <span className="todays-focus__reasons-title">
                      Why this is in your
                      focus
                    </span>

                    <ul>
                      {reasons.map(
                        reason => (
                          <li
                            key={reason}
                          >
                            {reason}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}
              </div>
            );
          }
        )}
      </div>
    </Card>
  );
}

export default TodaysFocus;
