import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { RuntimeRestoreJournal } from '../../server/src/runtime/runtimeRestoreJournal.js';
import {
  classifyRestoreRecoveryState,
  type RestoreFilesystemObservation,
} from '../../server/src/runtime/runtimeRestoreRecovery.js';

const base: RuntimeRestoreJournal = {
  schemaVersion: 2,
  operationId: '00000000-0000-4000-8000-000000000001',
  selectedSnapshotId: '20260903T000000.000Z-aaaaaaaa',
  startedAt: '2026-09-03T00:00:00.000Z',
  source: { state: 'valid', protection: { kind: 'snapshot', snapshotId: '20260903T000001.000Z-bbbbbbbb' } },
  decision: 'undecided',
  transition: 'prepare',
  transitionState: 'complete',
};

const observation = (values: Partial<RestoreFilesystemObservation>): RestoreFilesystemObservation => ({
  runtime: false, staging: false, displaced: false, failed: false,
  runtimeIsSelected: false, stagingIsSelected: false,
  runtimeIsProtected: false, displacedIsProtected: false,
  ...values,
});

function journal(values: Partial<RuntimeRestoreJournal>): RuntimeRestoreJournal {
  return { ...base, ...values } as RuntimeRestoreJournal;
}

describe('HS3B restore transaction journal v2 state matrix', () => {
  const rows: Array<[string, Partial<RuntimeRestoreJournal>, RestoreFilesystemObservation, string]> = [
    ['prepared', { transition: 'prepare', transitionState: 'complete' }, observation({ runtime: true }), 'AFTER'],
    ['stage intent before', { transition: 'stage', transitionState: 'intent' }, observation({ runtime: true }), 'BEFORE'],
    ['stage intent after', { transition: 'stage', transitionState: 'intent' }, observation({ runtime: true, staging: true, stagingIsSelected: true }), 'AFTER'],
    ['stage intent with partial owned staging', { transition: 'stage', transitionState: 'intent' }, observation({ runtime: true, staging: true }), 'BEFORE'],
    ['stage complete', { transition: 'stage', transitionState: 'complete' }, observation({ runtime: true, staging: true, stagingIsSelected: true }), 'AFTER'],
    ['displace intent before', { transition: 'displace', transitionState: 'intent' }, observation({ runtime: true, staging: true, runtimeIsProtected: true, stagingIsSelected: true }), 'BEFORE'],
    ['displace intent after', { transition: 'displace', transitionState: 'intent' }, observation({ staging: true, displaced: true, stagingIsSelected: true, displacedIsProtected: true }), 'AFTER'],
    ['displace complete', { transition: 'displace', transitionState: 'complete' }, observation({ staging: true, displaced: true, stagingIsSelected: true, displacedIsProtected: true }), 'AFTER'],
    ['publish intent before', { transition: 'publish', transitionState: 'intent' }, observation({ staging: true, displaced: true, stagingIsSelected: true, displacedIsProtected: true }), 'BEFORE'],
    ['publish intent after', { transition: 'publish', transitionState: 'intent' }, observation({ runtime: true, displaced: true, runtimeIsSelected: true, displacedIsProtected: true }), 'AFTER'],
    ['publish complete', { transition: 'publish', transitionState: 'complete' }, observation({ runtime: true, displaced: true, runtimeIsSelected: true, displacedIsProtected: true }), 'AFTER'],
    ['verify complete', { transition: 'verify', transitionState: 'complete', decision: 'forward' }, observation({ runtime: true, displaced: true, runtimeIsSelected: true, displacedIsProtected: true }), 'AFTER'],
    ['rollback quarantine before', { transition: 'rollback-quarantine', transitionState: 'intent', decision: 'rollback' }, observation({ runtime: true, displaced: true, runtimeIsSelected: true, displacedIsProtected: true }), 'BEFORE'],
    ['rollback quarantine after', { transition: 'rollback-quarantine', transitionState: 'intent', decision: 'rollback' }, observation({ displaced: true, failed: true, displacedIsProtected: true }), 'AFTER'],
    ['rollback return before', { transition: 'rollback-return', transitionState: 'intent', decision: 'rollback' }, observation({ displaced: true, failed: true, displacedIsProtected: true }), 'BEFORE'],
    ['rollback return after', { transition: 'rollback-return', transitionState: 'intent', decision: 'rollback' }, observation({ runtime: true, failed: true, runtimeIsProtected: true }), 'AFTER'],
    ['abort cleanup before', { transition: 'abort-cleanup', transitionState: 'intent', decision: 'abort' }, observation({ runtime: true, staging: true }), 'BEFORE'],
    ['abort cleanup after', { transition: 'abort-cleanup', transitionState: 'intent', decision: 'abort' }, observation({ runtime: true }), 'AFTER'],
    ['restored terminal', { transition: 'finalize', transitionState: 'intent', decision: 'forward', outcome: 'restored' }, observation({ runtime: true, displaced: true, runtimeIsSelected: true }), 'TERMINAL'],
    ['rolled back terminal with bak-capable B proof', { transition: 'finalize', transitionState: 'intent', decision: 'rollback', outcome: 'rolled-back' }, observation({ runtime: true, failed: true, runtimeIsProtected: true }), 'TERMINAL'],
    ['aborted terminal', { transition: 'finalize', transitionState: 'intent', decision: 'abort', outcome: 'aborted' }, observation({ runtime: true }), 'TERMINAL'],
  ];

  for (const [name, state, observed, expected] of rows) {
    it(name, () => assert.equal(classifyRestoreRecoveryState(journal(state), observed), expected));
  }

  for (const transition of ['displace', 'publish', 'rollback-quarantine', 'rollback-return'] as const) {
    it(`${transition} rejects every unsupported R/S/D/F presence combination without mutation`, () => {
      const expected = {
        displace: new Map([[3, 'BEFORE'], [6, 'AFTER']]),
        publish: new Map([[6, 'BEFORE'], [5, 'AFTER']]),
        'rollback-quarantine': new Map([[5, 'BEFORE'], [6, 'BEFORE'], [12, 'AFTER']]),
        'rollback-return': new Map([[12, 'BEFORE'], [9, 'AFTER']]),
      }[transition];
      for (let mask = 0; mask < 16; mask += 1) {
        const observed = observation({
          runtime: Boolean(mask & 1), staging: Boolean(mask & 2), displaced: Boolean(mask & 4), failed: Boolean(mask & 8),
          runtimeIsSelected: true, stagingIsSelected: true, runtimeIsProtected: true, displacedIsProtected: true,
        });
        const before = structuredClone(observed);
        const result = classifyRestoreRecoveryState(journal({ transition, transitionState: 'intent', decision: transition.startsWith('rollback') ? 'rollback' : 'undecided' }), observed);
        assert.equal(result, expected.get(mask) ?? 'AMBIGUOUS', `${transition} mask ${mask}`);
        assert.deepEqual(observed, before);
      }
    });
  }

  it('requires an AFTER filesystem for every complete transition', () => {
    assert.equal(classifyRestoreRecoveryState(journal({ transition: 'publish', transitionState: 'complete' }), observation({ staging: true, displaced: true, stagingIsSelected: true, displacedIsProtected: true })), 'AMBIGUOUS');
  });

  it('models absent and evidence-only sources without claiming production validity', () => {
    const absent = journal({ source: { state: 'absent', protection: { kind: 'none' } }, transition: 'publish', transitionState: 'intent' });
    assert.equal(classifyRestoreRecoveryState(absent, observation({ staging: true, stagingIsSelected: true })), 'BEFORE');
    const evidence = journal({ source: { state: 'invalid', protection: { kind: 'evidence-only' } }, transition: 'displace', transitionState: 'intent' });
    assert.equal(classifyRestoreRecoveryState(evidence, observation({ staging: true, displaced: true, stagingIsSelected: true, displacedIsProtected: true })), 'AFTER');
    const returnedEvidence = journal({ source: { state: 'invalid', protection: { kind: 'evidence-only' } }, decision: 'rollback', transition: 'finalize', transitionState: 'intent', outcome: 'rolled-back' });
    assert.equal(classifyRestoreRecoveryState(returnedEvidence, observation({ runtime: true, failed: true })), 'TERMINAL');
  });
});
