import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  reconcileRoutineRewards,
} from '../../server/src/services/routineRewardReconciler.ts';
import {
  RewardFileStore,
} from '../../server/src/services/rewardStore.ts';
import {
  RoutineFileStore,
  RoutineStoreCorruptError,
} from '../../server/src/services/routineStore.ts';

const temporaryDirectories: string[] = [];

async function stores() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'ey-routine-rewards-')
  );
  temporaryDirectories.push(directory);
  const routinePath = path.join(directory, 'routines.local.json');
  const rewardPath = path.join(directory, 'rewards.local.json');
  return {
    routinePath,
    rewardPath,
    routines: new RoutineFileStore(routinePath),
    rewards: new RewardFileStore(rewardPath),
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    directory => rm(directory, { recursive: true, force: true })
  ));
});

const routineInput = (amount = 7) => ({
  title: 'Safe test routine',
  ownerProfileId: 'child-1',
  active: true,
  schedule: {
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7] as const,
    startTime: null,
    endTime: null,
  },
  steps: [
    { id: 'step-1', title: 'First' },
    { id: 'step-2', title: 'Second' },
  ],
  reward: {
    recipientProfileId: 'child-1',
    currency: 'star' as const,
    amount,
  },
});

describe('automatic Routine rewards', () => {
  it('migrates schema v2 to v3 with a protected non-retroactive backup', async () => {
    const { routinePath, routines, rewards } = await stores();
    const legacy = {
      schemaVersion: 2,
      routines: [{
        id: 'legacy-routine',
        title: 'Legacy routine',
        ownerProfileId: 'child-1',
        active: true,
        schedule: {
          daysOfWeek: [1],
          startTime: null,
          endTime: null,
        },
        steps: [{ id: 'step-1', title: 'Step' }],
        createdAt: '2026-08-20T08:00:00.000Z',
        updatedAt: '2026-08-20T08:00:00.000Z',
      }],
      occurrences: [{
        id: 'legacy-routine@2026-08-24',
        routineId: 'legacy-routine',
        localDate: '2026-08-24',
        timeZone: 'Europe/London',
        snapshot: {
          title: 'Legacy routine',
          ownerProfileId: 'child-1',
          schedule: {
            daysOfWeek: [1],
            startTime: null,
            endTime: null,
          },
          steps: [{ id: 'step-1', title: 'Step' }],
          definitionUpdatedAt: '2026-08-20T08:00:00.000Z',
          capturedAt: '2026-08-24T08:00:00.000Z',
          source: 'captured',
        },
        completedSteps: {
          'step-1': '2026-08-24T08:05:00.000Z',
        },
        completedAt: '2026-08-24T08:05:00.000Z',
        updatedAt: '2026-08-24T08:05:00.000Z',
      }, {
        id: 'legacy-routine@2026-08-25',
        routineId: 'legacy-routine',
        localDate: '2026-08-25',
        timeZone: 'Europe/London',
        snapshot: {
          title: 'Legacy routine',
          ownerProfileId: 'child-1',
          schedule: {
            daysOfWeek: [1], startTime: null, endTime: null,
          },
          steps: [{ id: 'step-1', title: 'Step' }],
          definitionUpdatedAt: '2026-08-20T08:00:00.000Z',
          capturedAt: '2026-08-25T08:00:00.000Z',
          source: 'captured',
        },
        completedSteps: {},
        completedAt: null,
        updatedAt: '2026-08-25T08:00:00.000Z',
      }],
    };
    const raw = `${JSON.stringify(legacy, null, 2)}\n`;
    await writeFile(routinePath, raw, 'utf8');

    const migrated = await routines.read();
    assert.equal(migrated.schemaVersion, 3);
    assert.equal(migrated.routines[0].reward, null);
    assert.equal(migrated.occurrences[0].rewardContract, null);
    assert.equal(migrated.occurrences[0].completionSequence, 1);
    assert.equal(migrated.occurrences[1].completionSequence, 0);
    assert.equal(migrated.occurrences[1].rewardContract, null);
    assert.equal(await readFile(routines.backupPath, 'utf8'), raw);

    const restarted = new RoutineFileStore(routinePath);
    assert.deepEqual(await restarted.read(), migrated);
    assert.equal(await readFile(restarted.backupPath, 'utf8'), raw);

    await reconcileRoutineRewards(routines, rewards);
    assert.equal((await rewards.read()).transactions.length, 0);
  });

  it('captures an immutable contract and reconciles completion cycles idempotently', async () => {
    const { routines, rewards } = await stores();
    const definition = await routines.createRoutine(
      'routine-1',
      routineInput(),
      '2026-08-28T08:00:00.000Z'
    );
    await routines.materializeToday(
      { timeZone: 'Europe/London' },
      new Date('2026-08-28T09:00:00.000Z')
    );
    await routines.updateRoutine(
      definition.id,
      {
        ...routineInput(20),
        title: 'Changed later',
        reward: {
          recipientProfileId: 'child-2',
          currency: 'star',
          amount: 20,
        },
      },
      '2026-08-28T09:01:00.000Z'
    );

    let occurrence = (await routines.read()).occurrences[0];
    assert.deepEqual(occurrence.rewardContract, {
      recipientProfileId: 'child-1',
      currency: 'star',
      amount: 7,
    });

    await routines.updateOccurrence(definition.id, {
      localDate: '2026-08-28', timeZone: 'Europe/London',
      stepId: 'step-1', completed: true,
    }, '2026-08-28T09:02:00.000Z');
    const duplicateFinalWrites = await Promise.all([
      routines.updateOccurrence(definition.id, {
        localDate: '2026-08-28', timeZone: 'Europe/London',
        stepId: 'step-2', completed: true,
      }, '2026-08-28T09:03:00.000Z'),
      routines.updateOccurrence(definition.id, {
        localDate: '2026-08-28', timeZone: 'Europe/London',
        stepId: 'step-2', completed: true,
      }, '2026-08-28T09:03:01.000Z'),
    ]);
    occurrence = duplicateFinalWrites[1];
    assert.equal(occurrence.completionSequence, 1);

    await Promise.all([
      reconcileRoutineRewards(routines, rewards),
      reconcileRoutineRewards(routines, rewards),
    ]);
    let ledger = await rewards.read();
    assert.equal(ledger.transactions.length, 1);
    assert.equal(ledger.transactions[0].profileId, 'child-1');
    assert.equal(ledger.transactions[0].amount, 7);
    assert.match(ledger.transactions[0].source.eventKey, /completion:1$/);

    occurrence = await routines.updateOccurrence(definition.id, {
      localDate: '2026-08-28', timeZone: 'Europe/London',
      stepId: 'step-2', completed: false,
    }, '2026-08-28T09:04:00.000Z');
    assert.equal(occurrence.completionSequence, 1);
    await reconcileRoutineRewards(routines, rewards);

    occurrence = await routines.updateOccurrence(definition.id, {
      localDate: '2026-08-28', timeZone: 'Europe/London',
      stepId: 'step-2', completed: true,
    }, '2026-08-28T09:05:00.000Z');
    assert.equal(occurrence.completionSequence, 2);
    await reconcileRoutineRewards(routines, rewards);
    ledger = await rewards.read();
    assert.equal(ledger.transactions.length, 3);
    const activeAwards = ledger.transactions.filter(transaction =>
      transaction.entryType === 'award' &&
      !ledger.transactions.some(candidate =>
        candidate.relation?.kind === 'reversal-of' &&
        candidate.relation.transactionId === transaction.id
      )
    );
    assert.equal(activeAwards.length, 1);
    assert.match(activeAwards[0].source.eventKey, /completion:2$/);
  });

  it('keeps null and captured contracts fixed while definition rewards change', async () => {
    const { routines, rewards } = await stores();
    const definition = await routines.createRoutine(
      'routine-1',
      { ...routineInput(), reward: null },
      '2026-08-28T08:00:00.000Z'
    );
    await routines.materializeToday(
      { timeZone: 'Europe/London' },
      new Date('2026-08-28T09:00:00.000Z')
    );
    await routines.updateRoutine(
      definition.id,
      routineInput(12),
      '2026-08-28T09:01:00.000Z'
    );
    let occurrence = (await routines.read()).occurrences[0];
    assert.equal(occurrence.rewardContract, null);
    await routines.updateOccurrence(definition.id, {
      localDate: '2026-08-28', timeZone: 'Europe/London',
      stepId: 'step-1', completed: true,
    });
    await routines.updateOccurrence(definition.id, {
      localDate: '2026-08-28', timeZone: 'Europe/London',
      stepId: 'step-2', completed: true,
    });
    await reconcileRoutineRewards(routines, rewards);
    assert.equal((await rewards.read()).transactions.length, 0);

    await routines.materializeToday(
      { timeZone: 'Europe/London' },
      new Date('2026-08-29T09:00:00.000Z')
    );
    occurrence = (await routines.read()).occurrences.find(
      candidate => candidate.localDate === '2026-08-29'
    )!;
    assert.equal(occurrence.rewardContract?.amount, 12);
    await routines.updateRoutine(
      definition.id,
      { ...routineInput(), reward: null },
      '2026-08-29T09:01:00.000Z'
    );
    assert.equal(
      (await routines.read()).occurrences.find(
        candidate => candidate.localDate === '2026-08-29'
      )?.rewardContract?.amount,
      12
    );
  });

  it('enforces the 1–100 Routine configuration limit independently of the ledger bound', async () => {
    const { routines } = await stores();
    await routines.createRoutine('one', routineInput(1));
    await routines.createRoutine('hundred', routineInput(100));
    for (const amount of [0, 101, 1.5]) {
      await assert.rejects(
        routines.createRoutine(`invalid-${amount}`, routineInput(amount))
      );
    }
  });

  it('rejects two unreversed automatic awards for one occurrence', async () => {
    const { rewards } = await stores();
    const award = (sequence: number) => ({
      profileId: 'child-1',
      amount: 5,
      category: 'routine',
      reason: null,
      source: {
        kind: 'routine-completion',
        eventKey:
          `routine-occurrence:routine-1@2026-08-28:completion:${sequence}`,
        routineId: 'routine-1',
        occurrenceId: 'routine-1@2026-08-28',
        label: 'Routine completion',
      },
      actorProfileId: null,
      timeZone: 'Europe/London',
    });
    await rewards.appendAward(
      'award-1', award(1), new Date('2026-08-28T09:00:00.000Z')
    );
    await assert.rejects(
      rewards.appendAward(
        'award-2', award(2), new Date('2026-08-28T09:01:00.000Z')
      ),
      /multiple active awards/
    );
    assert.equal((await rewards.read()).transactions.length, 1);
  });

  it('keeps Routine state when Rewards fails and recovers after restart retry', async () => {
    const { rewardPath, routines, rewards } = await stores();
    const definition = await routines.createRoutine(
      'routine-1', routineInput(), '2026-08-28T08:00:00.000Z'
    );
    await routines.materializeToday(
      { timeZone: 'Europe/London' },
      new Date('2026-08-28T09:00:00.000Z')
    );
    await routines.updateOccurrence(definition.id, {
      localDate: '2026-08-28', timeZone: 'Europe/London',
      stepId: 'step-1', completed: true,
    });
    await routines.updateOccurrence(definition.id, {
      localDate: '2026-08-28', timeZone: 'Europe/London',
      stepId: 'step-2', completed: true,
    });
    await writeFile(rewardPath, '{ malformed', 'utf8');
    await assert.rejects(
      reconcileRoutineRewards(routines, rewards)
    );
    assert.equal((await routines.read()).occurrences[0].completedAt !== null, true);

    await writeFile(rewardPath, JSON.stringify({
      schemaVersion: 1,
      transactions: [],
    }), 'utf8');
    const restartedRewards = new RewardFileStore(rewardPath);
    await reconcileRoutineRewards(routines, restartedRewards);
    assert.equal((await restartedRewards.read()).transactions.length, 1);

    const validAwardLedger = await readFile(rewardPath, 'utf8');
    await routines.updateOccurrence(definition.id, {
      localDate: '2026-08-28', timeZone: 'Europe/London',
      stepId: 'step-2', completed: false,
    });
    await writeFile(rewardPath, '{ malformed again', 'utf8');
    await assert.rejects(
      reconcileRoutineRewards(routines, restartedRewards)
    );
    assert.equal((await routines.read()).occurrences[0].completedAt, null);

    await writeFile(rewardPath, validAwardLedger, 'utf8');
    const secondRestart = new RewardFileStore(rewardPath);
    await reconcileRoutineRewards(routines, secondRestart);
    const recovered = await secondRestart.read();
    assert.equal(recovered.transactions.length, 2);
    assert.equal(recovered.transactions[1].entryType, 'reversal');
  });

  it('refuses malformed/unsupported Routine stores without changing them', async () => {
    const { routinePath, routines } = await stores();
    const raw = JSON.stringify({ schemaVersion: 4, routines: [], occurrences: [] });
    await writeFile(routinePath, raw, 'utf8');
    await assert.rejects(
      routines.read(),
      RoutineStoreCorruptError
    );
    assert.equal(await readFile(routinePath, 'utf8'), raw);
  });
});
