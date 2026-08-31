import exampleStore from '../data/kumon.example.json';
import type {
  CreateKumonAssignmentInput,
  KumonAssignment,
  KumonStoreData,
  UpdateKumonAssignmentInput,
} from '../types/kumon';
import {
  getKumonToday,
} from './kumonDates';

const STORAGE_KEY = 'ey-os-demo-kumon-v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateDemoKumonStore(value: unknown): KumonStoreData {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.assignments)) {
    throw new Error('Demo Kumon data is invalid.');
  }
  const keys = new Set<string>();
  const ids = new Set<string>();
  for (const candidate of value.assignments) {
    if (
      !isRecord(candidate) || !UUID_PATTERN.test(String(candidate.id)) ||
      typeof candidate.localDate !== 'string' ||
      typeof candidate.childProfileId !== 'string' || candidate.childProfileId === 'family' ||
      (candidate.subject !== 'maths' && candidate.subject !== 'english') ||
      typeof candidate.assignmentLabel !== 'string' || candidate.assignmentLabel !== candidate.assignmentLabel.trim() ||
      !candidate.assignmentLabel || !Number.isSafeInteger(candidate.totalUnits) ||
      Number(candidate.totalUnits) < 1 || Number(candidate.totalUnits) > 100 ||
      !Number.isSafeInteger(candidate.completedUnits) || Number(candidate.completedUnits) < 0 ||
      Number(candidate.completedUnits) > Number(candidate.totalUnits) ||
      ((candidate.completedUnits === candidate.totalUnits) !== (candidate.completedAt !== null)) ||
      typeof candidate.createdAt !== 'string' || typeof candidate.updatedAt !== 'string'
    ) throw new Error('Demo Kumon data is invalid.');
    const key = `${candidate.localDate}\u0000${candidate.childProfileId}\u0000${candidate.subject}`;
    if (ids.has(String(candidate.id)) || keys.has(key)) throw new Error('Demo Kumon data is invalid.');
    ids.add(String(candidate.id));
    keys.add(key);
  }
  return value as KumonStoreData;
}

export class DemoKumonStore {
  private readonly storage?: StorageLike;

  constructor(storage?: StorageLike) {
    this.storage = storage;
  }

  private load(): KumonStoreData {
    const raw = this.storage?.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(exampleStore) as KumonStoreData;
    try {
      return validateDemoKumonStore(JSON.parse(raw) as unknown);
    } catch {
      throw new Error('Demo Kumon data is invalid. Clear this site\'s local storage to restore the safe example.');
    }
  }

  private save(store: KumonStoreData): void {
    validateDemoKumonStore(store);
    this.storage?.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  readRange(from: string, to: string): KumonAssignment[] {
    return this.load().assignments.filter(assignment =>
      assignment.localDate >= from && assignment.localDate <= to
    );
  }

  create(
    input: CreateKumonAssignmentInput,
    timeZone: string,
    now = new Date(),
    id = crypto.randomUUID()
  ): KumonAssignment {
    const store = this.load();
    const localDate = getKumonToday(now, timeZone);
    if (store.assignments.some(assignment =>
      assignment.localDate === localDate && assignment.childProfileId === input.childProfileId &&
      assignment.subject === input.subject
    )) throw new Error('That child already has this Kumon subject assigned today.');
    const label = input.assignmentLabel.trim();
    if (!label || label.length > 120 || input.childProfileId === 'family' ||
      !Number.isSafeInteger(input.totalUnits) || input.totalUnits < 1 || input.totalUnits > 100
    ) throw new Error('Kumon assignment details are invalid.');
    const timestamp = now.toISOString();
    const assignment: KumonAssignment = {
      id, localDate, childProfileId: input.childProfileId, subject: input.subject,
      assignmentLabel: label, totalUnits: input.totalUnits, completedUnits: 0,
      completedAt: null, createdAt: timestamp, updatedAt: timestamp,
    };
    store.assignments.push(assignment);
    this.save(store);
    return structuredClone(assignment);
  }

  update(id: string, input: UpdateKumonAssignmentInput, timeZone: string, now = new Date()): KumonAssignment {
    const store = this.load();
    const assignment = store.assignments.find(candidate => candidate.id === id);
    if (!assignment) throw new Error('Kumon assignment was not found.');
    if (assignment.localDate !== getKumonToday(now, timeZone)) throw new Error('Historical Kumon assignments are read-only.');
    if (assignment.completedUnits !== 0) throw new Error('Assignment details cannot change after progress has started.');
    const label = input.assignmentLabel.trim();
    if (!label || label.length > 120 || !Number.isSafeInteger(input.totalUnits) ||
      input.totalUnits < 1 || input.totalUnits > 100
    ) throw new Error('Kumon assignment changes are invalid.');
    assignment.assignmentLabel = label;
    assignment.totalUnits = input.totalUnits;
    assignment.updatedAt = now.toISOString();
    this.save(store);
    return structuredClone(assignment);
  }

  setProgress(id: string, completedUnits: number, timeZone: string, now = new Date()): KumonAssignment {
    const store = this.load();
    const assignment = store.assignments.find(candidate => candidate.id === id);
    if (!assignment) throw new Error('Kumon assignment was not found.');
    if (assignment.localDate !== getKumonToday(now, timeZone)) throw new Error('Historical Kumon assignments are read-only.');
    if (!Number.isSafeInteger(completedUnits) || completedUnits < 0 || completedUnits > assignment.totalUnits) {
      throw new Error('Completed units are invalid.');
    }
    if (completedUnits === assignment.completedUnits) return structuredClone(assignment);
    assignment.completedUnits = completedUnits;
    assignment.completedAt = completedUnits === assignment.totalUnits ? now.toISOString() : null;
    assignment.updatedAt = now.toISOString();
    this.save(store);
    return structuredClone(assignment);
  }

  delete(id: string, timeZone: string, now = new Date()): void {
    const store = this.load();
    const index = store.assignments.findIndex(candidate => candidate.id === id);
    if (index < 0) throw new Error('Kumon assignment was not found.');
    const assignment = store.assignments[index];
    if (assignment.localDate !== getKumonToday(now, timeZone)) throw new Error('Historical Kumon assignments are read-only.');
    if (assignment.completedUnits !== 0) throw new Error('A Kumon assignment cannot be deleted after progress has started.');
    store.assignments.splice(index, 1);
    this.save(store);
  }
}

export function createBrowserDemoKumonStore(): DemoKumonStore {
  return new DemoKumonStore(window.localStorage);
}
