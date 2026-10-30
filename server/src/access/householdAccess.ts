import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getHouseholdConfig, getRuntimeAppMode, HOUSEHOLD_ID_PATTERN, validateHouseholdConfig } from '../config/householdConfig.js';
import { getRuntimeDataConfiguration } from '../config/runtimeData.js';
import { preflightRuntimeData, validateHouseholdScope } from '../runtime/runtimeValidation.js';

export const ACCESS_STATUS = {
  HOUSEHOLD_CONTEXT_UNAVAILABLE: 503,
  HOUSEHOLD_SCOPE_MISMATCH: 403,
  INVALID_MEMBER_CONTEXT: 400,
  DEMO_HOUSEHOLD_CROSSOVER: 403,
  HOUSEHOLD_CONTEXT_INVALID: 503,
} as const;
export class AccessError extends Error {
  readonly status: number;
  constructor(readonly code: keyof typeof ACCESS_STATUS) {
    super('Household access is unavailable.');
    this.status = ACCESS_STATUS[code];
  }
}
export type HouseholdAccessContext = Readonly<{
  householdId: string;
  scope: 'HOUSEHOLD';
  source: 'RUNTIME';
}>;
type Binding = { runtimeKey: string; runtime: ReturnType<typeof getRuntimeDataConfiguration>; config: ReturnType<typeof getHouseholdConfig> };
const issued = new WeakMap<HouseholdAccessContext, Binding>();
const scope = new AsyncLocalStorage<HouseholdAccessContext>();

/** Only validated, external v3 runtime state can issue a capability. No client input. */
export async function establishHouseholdAccess(): Promise<HouseholdAccessContext> {
  if (getRuntimeAppMode() !== 'household') throw new AccessError('DEMO_HOUSEHOLD_CROSSOVER');
  const runtime = getRuntimeDataConfiguration();
  if (!runtime.external || runtime.policy !== 'required' || !runtime.rootPath || runtime.appMode !== 'household') throw new AccessError('HOUSEHOLD_CONTEXT_UNAVAILABLE');
  try {
    const config = getHouseholdConfig();
    validateHouseholdConfig(config);
    await preflightRuntimeData(runtime);
    await validateHouseholdScope(runtime.rootPath);
    const diskConfig = validateHouseholdConfig(JSON.parse(await readFile(join(runtime.rootPath, 'config', 'household.json'), 'utf8')));
    if (diskConfig.household.householdId !== config.household.householdId) throw new Error('Runtime identity differs');
    // Async establishment must not issue against a replaced runtime/config.
    if (runtime !== getRuntimeDataConfiguration() || config !== getHouseholdConfig()) throw new Error('Changed runtime');
    const context: HouseholdAccessContext = Object.freeze({ householdId: config.household.householdId, scope: 'HOUSEHOLD', source: 'RUNTIME' });
    issued.set(context, { runtime, runtimeKey: JSON.stringify(runtime), config });
    return context;
  } catch { throw new AccessError('HOUSEHOLD_CONTEXT_INVALID'); }
}
export function assertHouseholdAccess(context: unknown): asserts context is HouseholdAccessContext {
  if (!context) throw new AccessError('HOUSEHOLD_CONTEXT_UNAVAILABLE');
  if (getRuntimeAppMode() !== 'household') throw new AccessError('DEMO_HOUSEHOLD_CROSSOVER');
  const binding = typeof context === 'object' ? issued.get(context as HouseholdAccessContext) : undefined;
  try {
    if (!binding || binding.runtime !== getRuntimeDataConfiguration() || binding.runtimeKey !== JSON.stringify(binding.runtime) || binding.config !== getHouseholdConfig() ||
      (context as HouseholdAccessContext).householdId !== binding.config.household.householdId ||
      !HOUSEHOLD_ID_PATTERN.test(binding.config.household.householdId)) throw new Error('Invalid binding');
  } catch { throw new AccessError('HOUSEHOLD_CONTEXT_INVALID'); }
}
export function requireHouseholdAccess(): HouseholdAccessContext {
  const context = scope.getStore();
  assertHouseholdAccess(context);
  return context;
}
/** Explicit capability at entry; scoped propagation protects nested existing algorithms. */
export function withHouseholdAccess<T>(context: HouseholdAccessContext, operation: () => T): T {
  assertHouseholdAccess(context);
  return scope.run(context, operation);
}
/** Live singleton only. Explicit FileStore instances remain available to offline tools/tests. */
export function guardedLiveService<T extends object>(factory: () => T): T {
  const instances = new WeakMap<object, T>();
  return new Proxy({} as T, {
    get(_target, property) {
      return (...args: unknown[]) => {
        const context = requireHouseholdAccess();
        const runtime = context;
        let instance = instances.get(runtime);
        if (!instance) { instance = factory(); instances.set(runtime, instance); }
        assertHouseholdAccess(context);
        const method = Reflect.get(instance, property);
        if (typeof method !== 'function') throw new AccessError('HOUSEHOLD_CONTEXT_INVALID');
        return Reflect.apply(method, instance, args);
      };
    },
  });
}
