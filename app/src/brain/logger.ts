import type {
  BrainDecision,
} from './types';

export function getBrainDecisionLogLabel(
  decision: BrainDecision
): string {
  return decision.source === 'routine'
    ? '[Household routine]'
    : decision.item.title;
}

export function logBrainDecisions(
  decisions: BrainDecision[]
): void {
  if (!import.meta.env?.DEV) {
    return;
  }

  console.groupCollapsed(
    `Today's Brain — ${decisions.length} selected items`
  );

  decisions.forEach(
    (decision, index) => {
      console.groupCollapsed(
        `${index + 1}. ${getBrainDecisionLogLabel(decision)} — Score ${decision.score}`
      );

      console.log(
        'Source:',
        decision.source
      );

      if (decision.source === 'routine') {
        console.log(
          'Household routine details redacted.'
        );
      } else {
        console.log(
          'Priority:',
          decision.item.priority
        );

        console.log(
          'Status:',
          decision.item.status
        );

        console.log('Reasons:');

        decision.reasons.forEach(
          reason => {
            console.log(`• ${reason}`);
          }
        );
      }

      console.groupEnd();
    }
  );

  console.groupEnd();
}
