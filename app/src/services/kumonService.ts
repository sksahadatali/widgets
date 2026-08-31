import {
  createBrowserDemoKumonStore,
  type DemoKumonStore,
} from '../kumon/demoKumonStore';
import type {
  CreateKumonAssignmentInput,
  KumonAssignment,
  UpdateKumonAssignmentInput,
} from '../types/kumon';
import {
  getAppMode,
} from './householdConfigService';
import { apiUrl } from './clientApi';

const REQUEST_TIMEOUT_MS = 15000;
let demoStore: DemoKumonStore | null = null;

type KumonApiResponse = {
  success: boolean;
  assignments?: KumonAssignment[];
  assignment?: KumonAssignment;
  error?: string;
};

function getDemoStore(): DemoKumonStore {
  demoStore ??= createBrowserDemoKumonStore();
  return demoStore;
}

async function request(path: string, init?: RequestInit): Promise<KumonApiResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(apiUrl(path), { ...init, signal: controller.signal });
    const payload = await response.json() as KumonApiResponse;
    if (!response.ok || !payload.success) throw new Error(payload.error || 'Kumon is unavailable.');
    return payload;
  } finally {
    window.clearTimeout(timeout);
  }
}

const json = (body: unknown): RequestInit => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export async function loadKumonAssignments(from: string, to: string): Promise<KumonAssignment[]> {
  if (getAppMode() === 'demo') return getDemoStore().readRange(from, to);
  const payload = await request(`/api/kumon?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  return payload.assignments ?? [];
}

export async function createKumonAssignment(
  input: CreateKumonAssignmentInput,
  timeZone: string
): Promise<void> {
  if (getAppMode() === 'demo') {
    getDemoStore().create(input, timeZone);
    return;
  }
  await request('/api/kumon', { method: 'POST', ...json({ ...input, timeZone }) });
}

export async function updateKumonAssignment(
  id: string,
  input: UpdateKumonAssignmentInput,
  timeZone: string
): Promise<void> {
  if (getAppMode() === 'demo') {
    getDemoStore().update(id, input, timeZone);
    return;
  }
  await request(`/api/kumon/${encodeURIComponent(id)}`, {
    method: 'PATCH', ...json({ ...input, timeZone }),
  });
}

export async function setKumonProgress(
  id: string,
  completedUnits: number,
  timeZone: string
): Promise<void> {
  if (getAppMode() === 'demo') {
    getDemoStore().setProgress(id, completedUnits, timeZone);
    return;
  }
  await request(`/api/kumon/${encodeURIComponent(id)}/progress`, {
    method: 'PATCH', ...json({ completedUnits, timeZone }),
  });
}

export async function deleteKumonAssignment(id: string, timeZone: string): Promise<void> {
  if (getAppMode() === 'demo') {
    getDemoStore().delete(id, timeZone);
    return;
  }
  await request(`/api/kumon/${encodeURIComponent(id)}`, {
    method: 'DELETE', ...json({ timeZone }),
  });
}
