import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import type { HouseholdProfile } from '../../app/src/household/householdProfiles.ts';
import { DemoKumonStore, validateDemoKumonStore } from '../../app/src/kumon/demoKumonStore.ts';
import { getKumonToday, getRecentKumonDates } from '../../app/src/kumon/kumonDates.ts';
import {
  canManageKumon,
  canUpdateKumonProgress,
  isChildKumonComplete,
  selectVisibleKumonAssignments,
} from '../../app/src/kumon/kumonSelectors.ts';
import type { KumonAssignment } from '../../app/src/types/kumon.ts';

const family: HouseholdProfile = { id: 'family', kind: 'family', displayName: 'Example Household' };
const adult: HouseholdProfile = { id: 'adult-1', kind: 'member', displayName: 'Alex', memberType: 'adult' };
const childOne: HouseholdProfile = { id: 'child-1', kind: 'member', displayName: 'Sam', memberType: 'child' };
const childTwo: HouseholdProfile = { id: 'child-2', kind: 'member', displayName: 'Taylor', memberType: 'child' };
const profiles = [family, adult, childOne, childTwo];
const NOW = new Date('2026-08-31T09:00:00Z');

function assignment(overrides: Partial<KumonAssignment> = {}): KumonAssignment {
  return {
    id: '11111111-1111-4111-8111-111111111111', localDate: '2026-08-31',
    childProfileId: 'child-1', subject: 'maths', assignmentLabel: 'Worksheets 1–10',
    totalUnits: 10, completedUnits: 0, completedAt: null,
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), ...overrides,
  };
}

describe('Kumon profile selectors', () => {
  const records = [
    assignment(),
    assignment({ id: '22222222-2222-4222-8222-222222222222', childProfileId: 'child-2' }),
    assignment({ id: '33333333-3333-4333-8333-333333333333', childProfileId: 'removed-child' }),
  ];

  it('gives Family and adults all current children while hiding removed profiles', () => {
    for (const selectedProfile of [family, adult]) {
      assert.deepEqual(selectVisibleKumonAssignments({ assignments: records, profiles, selectedProfile }).map(item => item.childProfileId), ['child-1', 'child-2']);
    }
  });

  it('shows a child only their own assignment and hides siblings', () => {
    assert.deepEqual(selectVisibleKumonAssignments({ assignments: records, profiles, selectedProfile: childOne }).map(item => item.childProfileId), ['child-1']);
  });

  it('keeps Family read-only, adult-managed, and child progress own-only', () => {
    assert.equal(canManageKumon(family), false);
    assert.equal(canManageKumon(adult), true);
    assert.equal(canManageKumon(childOne), false);
    assert.equal(canUpdateKumonProgress(family, records[0]), false);
    assert.equal(canUpdateKumonProgress(adult, records[0]), true);
    assert.equal(canUpdateKumonProgress(childOne, records[0]), true);
    assert.equal(canUpdateKumonProgress(childTwo, records[0]), false);
  });

  it('does not treat no assignment as complete and requires every subject', () => {
    assert.equal(isChildKumonComplete([]), false);
    assert.equal(isChildKumonComplete([assignment({ completedUnits: 10, completedAt: NOW.toISOString() })]), true);
    assert.equal(isChildKumonComplete([
      assignment({ completedUnits: 10, completedAt: NOW.toISOString() }),
      assignment({ id: '22222222-2222-4222-8222-222222222222', subject: 'english' }),
    ]), false);
  });
});

describe('Kumon Demo isolation and dates', () => {
  it('starts from empty synthetic schema-v1 data and persists only in supplied Demo storage', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const demo = new DemoKumonStore(storage);
    assert.deepEqual(demo.readRange('2026-08-25', '2026-08-31'), []);
    const created = demo.create({
      childProfileId: 'child-1', subject: 'maths', assignmentLabel: 'Example worksheets', totalUnits: 10,
    }, 'Europe/London', NOW, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    assert.equal(created.completedUnits, 0);
    assert.equal(demo.setProgress(created.id, 10, 'Europe/London', new Date('2026-08-31T10:00:00Z')).completedAt, '2026-08-31T10:00:00.000Z');
    assert.doesNotThrow(() => validateDemoKumonStore(JSON.parse([...values.values()][0]) as unknown));
  });

  it('uses Household timezone and seven civil dates across boundaries', () => {
    assert.equal(getKumonToday(new Date('2026-08-31T23:30:00Z'), 'Europe/London'), '2026-09-01');
    assert.deepEqual(getRecentKumonDates('2027-01-01'), [
      '2027-01-01', '2026-12-31', '2026-12-30', '2026-12-29', '2026-12-28', '2026-12-27', '2026-12-26',
    ]);
  });

  it('keeps tracked Demo data empty and service routes Demo before Household requests', async () => {
    const example = JSON.parse(await readFile(new URL('../../app/src/data/kumon.example.json', import.meta.url), 'utf8')) as unknown;
    assert.deepEqual(validateDemoKumonStore(example), { schemaVersion: 1, assignments: [] });
    const source = await readFile(new URL('../../app/src/services/kumonService.ts', import.meta.url), 'utf8');
    assert.match(source, /getAppMode\(\) === 'demo'/);
    assert.ok(source.indexOf("getAppMode() === 'demo'") < source.indexOf("request(`/api/kumon?"));
  });

  it('keeps the focused Daily UI boundary and touch controls explicit', async () => {
    const source = await readFile(
      new URL('../../app/src/components/kumon/KumonToday.tsx', import.meta.url),
      'utf8'
    );
    assert.match(source, /Kumon Today/);
    assert.match(source, /Assign homework/);
    assert.match(source, /Recent 7 days/);
    assert.match(source, /Decrease .* progress/);
    assert.match(source, /Increase .* progress/);
    assert.match(source, /Complete/);
  });
});
