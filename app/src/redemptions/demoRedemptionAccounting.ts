import {
  appendDemoRedemption,
  getDemoRewardStore,
  refundDemoRedemption,
} from '../rewards/demoRewardStore';
import {
  cancelDemoRedemptionRequest,
  declineDemoRedemptionRequest,
  getDemoRedemptionStore,
} from './demoRedemptionStore';
import {
  getRedemptionRequestStatus,
} from './redemptionSelectors';

type LifecycleOperation =
  | 'approve'
  | 'refund'
  | 'cancel'
  | 'decline';

let lifecycleQueue: Promise<void> = Promise.resolve();

function assertActor(actorProfileId: string): void {
  if (!actorProfileId.trim() || actorProfileId === 'family') {
    throw new Error(
      'Select an adult profile to manage this Redemption request.'
    );
  }
}

function runLifecycle(
  operation: () => void
): Promise<void> {
  let operationError: unknown;
  lifecycleQueue = lifecycleQueue
    .catch(() => undefined)
    .then(() => {
      try {
        operation();
      } catch (error) {
        operationError = error;
      }
    });
  return lifecycleQueue.then(() => {
    if (operationError) throw operationError;
  });
}

function mutate(
  requestId: string,
  actorProfileId: string,
  operation: LifecycleOperation,
  now: Date
): void {
  assertActor(actorProfileId);
  const request = getDemoRedemptionStore().requests.find(
    candidate => candidate.id === requestId
  );
  if (!request) {
    throw new Error('Redemption request was not found.');
  }
  const status = getRedemptionRequestStatus(
    request,
    getDemoRewardStore().transactions
  );
  if (status === 'accounting-error') {
    throw new Error('Redemption accounting is inconsistent.');
  }

  switch (operation) {
    case 'approve':
      if (status === 'cancelled' || status === 'declined') {
        throw new Error(
          'A closed Redemption request cannot be approved.'
        );
      }
      if (status === 'approved' || status === 'refunded') {
        return;
      }
      appendDemoRedemption(request, actorProfileId, now);
      return;
    case 'refund':
      if (status === 'refunded') return;
      if (status !== 'approved') {
        throw new Error(
          'Only an approved Redemption request can be refunded.'
        );
      }
      refundDemoRedemption(request, actorProfileId, now);
      return;
    case 'cancel':
      if (status === 'approved' || status === 'refunded') {
        throw new Error(
          'An approved Redemption request cannot be cancelled without a refund.'
        );
      }
      cancelDemoRedemptionRequest(
        requestId,
        actorProfileId,
        now
      );
      return;
    case 'decline':
      if (status === 'approved' || status === 'refunded') {
        throw new Error(
          'An approved Redemption request cannot be declined.'
        );
      }
      declineDemoRedemptionRequest(
        requestId,
        actorProfileId,
        now
      );
  }
}

export function approveDemoRedemptionRequest(
  requestId: string,
  actorProfileId: string,
  now = new Date()
): Promise<void> {
  return runLifecycle(() => mutate(
    requestId,
    actorProfileId,
    'approve',
    now
  ));
}

export function refundDemoRedemptionRequest(
  requestId: string,
  actorProfileId: string,
  now = new Date()
): Promise<void> {
  return runLifecycle(() => mutate(
    requestId,
    actorProfileId,
    'refund',
    now
  ));
}

export function cancelDemoRedemptionLifecycle(
  requestId: string,
  actorProfileId: string,
  now = new Date()
): Promise<void> {
  return runLifecycle(() => mutate(
    requestId,
    actorProfileId,
    'cancel',
    now
  ));
}

export function declineDemoRedemptionLifecycle(
  requestId: string,
  actorProfileId: string,
  now = new Date()
): Promise<void> {
  return runLifecycle(() => mutate(
    requestId,
    actorProfileId,
    'decline',
    now
  ));
}
