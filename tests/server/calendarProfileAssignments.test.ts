import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, it } from 'node:test';

import {
  CalendarProfileAssignmentFileStore,
  resolveCalendarProfileAssignment,
  validateCalendarProfileAssignmentStore,
} from '../../server/src/services/calendarProfileAssignmentStore.js';

const paths: string[] = [];
async function file() {
  const root = await mkdtemp(join(tmpdir(), 'eyos-calendar-assignment-'));
  paths.push(root);
  return join(root, 'calendar-profile-assignments.local.json');
}
afterEach(async () => Promise.all(paths.splice(0).map(path => rm(path, { recursive: true, force: true }))));
const key = (character: string) => `calendar-event-v1-${character.repeat(64)}`;

describe('Calendar profile assignment store', () => {
  it('persists Family, ordered members, and explicit Unassigned with atomic backup evidence', async () => {
    const path = await file();
    const store = new CalendarProfileAssignmentFileStore(path, 'initialize');
    await store.set(key('b'), { kind: 'members', profileIds: ['child', 'adult'] }, ['adult', 'child'], new Date('2026-09-19T10:00:00Z'));
    await store.set(key('a'), { kind: 'family' }, ['adult', 'child'], new Date('2026-09-19T10:01:00Z'));
    await store.set(key('c'), { kind: 'unassigned' }, ['adult', 'child'], new Date('2026-09-19T10:02:00Z'));
    const value = await store.read();
    assert.deepEqual(value.assignments.map(item => item.eventKey), [key('a'), key('b'), key('c')]);
    assert.deepEqual(value.assignments[1].target, { kind: 'members', profileIds: ['adult', 'child'] });
    assert.deepEqual(validateCalendarProfileAssignmentStore(JSON.parse(await readFile(store.backupPath, 'utf8'))).assignments.map(item => item.eventKey), [key('a'), key('b')]);
  });

  it('clears an override without selecting backup data', async () => {
    const path = await file();
    const store = new CalendarProfileAssignmentFileStore(path, 'initialize');
    await store.set(key('a'), { kind: 'family' }, ['adult']);
    assert.equal(await store.remove(key('a')), true);
    assert.deepEqual((await store.read()).assignments, []);
    assert.equal(await store.remove(key('a')), false);
  });

  it('rejects legacy keys, unknown profiles, duplicates, unknown fields, and malformed primary data', async () => {
    const path = await file();
    const store = new CalendarProfileAssignmentFileStore(path, 'initialize');
    assert.throws(() => store.set('calendar-legacy', { kind: 'family' }, ['adult']), /invalid or unsupported/);
    assert.throws(() => store.set(key('a'), { kind: 'members', profileIds: ['missing'] }, ['adult']), /unknown Household member/);
    assert.throws(() => validateCalendarProfileAssignmentStore({ schemaVersion: 1, assignments: [
      { eventKey: key('a'), target: { kind: 'members', profileIds: ['adult', 'adult'] }, updatedAt: '2026-09-19T10:00:00Z' },
    ] }), /invalid/);
    assert.throws(() => validateCalendarProfileAssignmentStore({ schemaVersion: 1, assignments: [], extra: true }), /malformed/);
    await writeFile(path, '{bad');
    await assert.rejects(() => store.read(), /malformed/);
  });

  it('persists no Calendar provider locators or event presentation data', async () => {
    const path = await file();
    const store = new CalendarProfileAssignmentFileStore(path, 'initialize');
    await store.set(key('a'), { kind: 'members', profileIds: ['adult'] }, ['adult']);
    const text = await readFile(path, 'utf8');
    for (const forbidden of ['providerEventId', 'calendarId', 'recurringEventId', 'originalStartTime', 'iCalUID', 'etag', 'title', 'location', 'description']) assert.doesNotMatch(text, new RegExp(forbidden));
  });

  it('resolves explicit overrides before private source defaults and keeps Unassigned explicit', () => {
    const sources = [{ sourceId: 'school', label: 'School', kind: 'school', calendarName: 'Private', defaultProfileAssignment: { kind: 'members' as const, profileIds: ['child'] } }];
    assert.deepEqual(resolveCalendarProfileAssignment(key('a'), 'school', [], sources), { target: { kind: 'members', profileIds: ['child'] }, basis: 'source-default' });
    const explicit = [{ eventKey: key('a'), target: { kind: 'unassigned' as const }, updatedAt: '2026-09-19T10:00:00.000Z' }];
    assert.deepEqual(resolveCalendarProfileAssignment(key('a'), 'school', explicit, sources), { target: { kind: 'unassigned' }, basis: 'explicit' });
    assert.deepEqual(resolveCalendarProfileAssignment(key('b'), 'unknown', [], sources), { target: { kind: 'unassigned' }, basis: 'none' });
  });
});
