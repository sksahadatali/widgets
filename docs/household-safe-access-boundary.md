# AI-1B household-safe server boundary

Baseline: `597e3a67b2e6e9e957741d39ff296f5bb10684f9`.

AI-1B provides runtime-derived HOUSEHOLD scope, not authentication or member
permissions. Profile selection, names, aliases and adult/child classification
never establish authority. Existing trusted LAN/remote access controls remain
necessary. No operational state is copied into Family Knowledge.

## Establishment and readiness

`server.ts` establishes access after runtime preflight and canonical config load,
before listen and startup Routine reward reconciliation. `establishHouseholdAccess`
reuses AI-1A schema/layout/envelope validation, checks loaded and disk household
identity, and issues a frozen object registered in a private WeakMap. Structural
copies are not capabilities. Each capability is bound to the config object,
runtime object and runtime configuration fingerprint; a replaced or mutated
binding fails closed.

Household development now requires an existing, valid external v3 runtime through
`EYOS_RUNTIME_DIR`, just as production does. The legacy local `initialize` path
cannot establish trusted access. No envelope/identity is manufactured or migrated
at startup. Use the existing AI-1A migration on private copies if needed.

Integrity is established at startup, not by polling all files on every request.
Live runtime switching is unsupported. Administrative runtime/config changes use
the existing offline lifecycle; restart to revalidate. Filesystem administrators
remain trusted, as in AI-1A. No schema or production configuration change occurs.

## HTTP registration

Every one of the 57 API endpoints uses `classifiedRouter` with mandatory
classification. All existing real operations are HOUSEHOLD. Calendar, Weather and
Prayer have explicit Demo variants selected by server mode (three variant pairs).
Demo cannot reach Tasks, Nest, Petrol or real runtime stores. Demo receives no
HouseholdAccessContext. There are no new Demo CRUD endpoints.

`publicGet` explicitly registers public health and index routes. Static assets and
SPA fallback remain public after the API deny fallback. A recursive startup check
rejects raw/unclassified Express route registrations, including nested routers
and unclassified middleware. Transport/static/error middleware is explicitly
registered as infrastructure and may not act as a domain endpoint.
GET/HEAD execute the same boundary. OPTIONS does not execute domain handlers;
unknown methods/paths cannot fall through to household operations.

API inventory by router: Calendar 5, client config 2, Kumon 5, Lists 11, Meals 4,
Nest 1, Petrol 1, Prayer 1, Redemptions 10, Rewards 3, Routines 7, Tasks 5,
Travel 1, Weather 1. `routeManifest()` exposes the registration metadata for tests.

## Assertions and member context

Existing clients need no new headers. Optional assertions are accepted only at:

- `X-EYOS-Household-ID`, query `householdId`, top-level body `householdId`;
- `X-EYOS-App-Mode`, query `appMode`, top-level body `appMode`.

Only one representation of each assertion is allowed. Matching assertions grant
nothing. Conflicting, malformed or repeated assertions are rejected. JSON parser
verification detects repeated top-level assertion keys, including escaped keys,
without retaining request contents. Identity transport fields are removed before
domain validation; free text/nested domain payload is not searched for identities.

Canonical member validation covers current Calendar assignment targets, Routine
owners/reward recipients, manual Rewards attribution/recipients, Redemption
participants, Lists attribution and legacy Kumon owners. Active membership is
required for supplied current participants. Family is allowed only in existing
Family-capable positions; nullable attribution is retained where the domain
already accepts it. Domain validators still enforce required fields and payload
shape. `validateMemberContext({historical:true})` supports explicit historical
resolution; it is not a client-controlled permission flag. Existing stored
inactive/unresolved references and captured accounting contracts are not rewritten
or invalidated. No memberType-based authorization is added.

## Services and internal work

The HTTP boundary checks capability and member input before any handler. An
explicit `withHouseholdAccess(capability, operation)` entry propagates capability
through Node AsyncLocalStorage. This small scoped propagation avoids threading a
new parameter through every existing accounting/storage algorithm. It is not a
login/session mechanism and does not issue capabilities from ambient/client data.
Unrelated async execution has no context.

Exported live runtime stores, Redemption accounting, Calendar coordinator and edit
registry are guarded lazy facades. They validate before constructing/accessing a
live instance. Instances are capability-scoped, preserving shared Calendar
in-flight deduplication within the server's single capability and separating
runtime/edit state across establishments. Provider entry points also require
context before cached results or network calls. Startup reconciliation enters the
same explicit capability scope.

Explicit FileStore instances and pure validators/selectors remain available for
trusted offline tooling and isolated tests. They are not request-facing services;
new HTTP handlers must use classified registration and guarded live services.
No general sandbox against malicious server code is claimed.

## Errors and diagnostics

Fixed status/code pairs:

- HOUSEHOLD_CONTEXT_UNAVAILABLE: 503
- HOUSEHOLD_CONTEXT_INVALID: 503
- HOUSEHOLD_SCOPE_MISMATCH: 403
- DEMO_HOUSEHOLD_CROSSOVER: 403
- INVALID_MEMBER_CONTEXT: 400

Responses use a generic message, code and `success:false`, with no IDs, member
registry, addresses, paths or provider details. Boundary translation is central.
Nest/Petrol response paths no longer return raw provider errors/data.

Audit emits only fixed route pattern, classification, ALLOW/DENY, fixed reason
code and timestamp. It never emits supplied identifiers or bodies. No persistent
audit store is added. An unavailable diagnostic sink cannot turn denial into allow.

## Tests and office acceptance

New access tests cover real v3 establishment, forged/missing/foreign capability,
invalid/missing/nonempty/foreign envelope, binding mutation, async isolation,
canonical active/historical/Family semantics, read/mutation compatibility,
assertions including duplicates, all 57 endpoint denials, zero provider calls and
missing-store noninitialization, Demo rejection, HEAD/OPTIONS/unknown paths,
classification completeness/raw route rejection, minimal responses and audit.

Existing provider tests now enter real validated temporary v3 runtimes instead of
calling live services without context. Synthetic older config fixtures are
canonicalized in the shared test helper. The topology test now expects Demo
crossover rejection before Meals input validation. Privacy API fixtures use the
same module graph as Express; static/dynamic CJS/ESM duplication must not produce
independent capability registries. Domain accounting assertions are retained.

Office acceptance, private runtime copies only:

1. Start Household with accepted external v3 runtime. Check health, client config,
   Home, Calendar read/edit/assignments, Routines completion/history, Rewards and
   Redemptions, Lists, Meals and existing providers.
2. Verify normal requests work with no new identity headers.
3. Send a conflicting household assertion to a read and mutation; expect generic
   403 and no changes/provider calls. Unknown/inactive current participant => 400.
4. Verify historical inactive/unresolved labels/records remain available unchanged.
5. On an isolated copy, corrupt/mismatch the envelope; startup must fail without
   repair. Legacy local initialization must not establish trusted access.
6. Run Demo separately: synthetic Calendar/Weather/Prayer remain available;
   Tasks/Nest/Petrol and real store routes reject with 403. No real data appears.
7. Check boundary logs contain only fixed metadata. No credentials or production
   configuration changes are needed. Office acceptance precedes any PR/deployment.

## Recorded validation

All validation uses synthetic fixtures or temporary external runtime copies.

- Runtime/configuration: `npm run test:runtime --prefix server` — 148 passed.
- Complete server suite: from `server`, `NODE_PATH=./node_modules:../app/node_modules node --import tsx --test --test-concurrency=1 ../tests/server/*.test.ts` — 214 passed, including 22 new access-boundary tests.
- Operational regression: same runner with `../tests/routines/*.test.ts ../tests/rewards/*.test.ts ../tests/lists/*.test.ts ../tests/meals/*.test.ts ../tests/kumon/*.test.ts` — 211 passed.
- Calendar regression: same runner with `TSX_TSCONFIG_PATH=../tests/calendar/tsconfig.json` and `../tests/calendar/*.test.ts` — 96 passed.
- Client compatibility: same runner with `TSX_TSCONFIG_PATH=../tests/client/tsconfig.json` and `clientConfig.test.ts`, `householdProfileNavigation.test.tsx`, `calendarProfileAssignments.test.tsx`, `calendarEventEditing.test.tsx`, `calendarWindowFetch.test.tsx`, `homeCalendarCompactAssignee.test.tsx` from `../tests/client` — 30 passed.
- `VITE_EY_MODE=household npm run build:production` — frontend production/TypeScript and server TypeScript passed.
- Standalone `npm run build --prefix server` — passed.
- `git diff --check` — passed.

No server lint script or repository workflow mandates an additional linter. No
frontend source was changed; frontend TypeScript validation runs in its build.

## Exact implementation inventory

50 files; no application configuration, runtime data, persisted schemas, migrations or frontend source changes.

```text
docs/household-safe-access-boundary.md
server/src/access/classifiedRouter.ts
server/src/access/householdAccess.ts
server/src/access/memberContext.ts
server/src/app.ts
server/src/routes/calendar.ts
server/src/routes/clientConfig.ts
server/src/routes/kumon.ts
server/src/routes/lists.ts
server/src/routes/meals.ts
server/src/routes/nest.ts
server/src/routes/petrol.ts
server/src/routes/prayerTimes.ts
server/src/routes/redemptions.ts
server/src/routes/rewards.ts
server/src/routes/routines.ts
server/src/routes/tasks.ts
server/src/routes/travel.ts
server/src/routes/weather.ts
server/src/server.ts
server/src/services/calendarEditRegistry.ts
server/src/services/calendarEventWriter.ts
server/src/services/calendarProfileAssignmentStore.ts
server/src/services/calendarProvider.ts
server/src/services/calendarReadCoordinator.ts
server/src/services/familyListStore.ts
server/src/services/kumonStore.ts
server/src/services/mealPlanStore.ts
server/src/services/nestService.ts
server/src/services/notionService.ts
server/src/services/petrolService.ts
server/src/services/prayerProvider.ts
server/src/services/redemptionAccountingService.ts
server/src/services/redemptionStore.ts
server/src/services/rewardStore.ts
server/src/services/routineRewardReconciler.ts
server/src/services/routineStore.ts
server/src/services/travelProvider.ts
server/src/services/weatherProvider.ts
tests/server/calendarEventWrites.test.ts
tests/server/calendarProviderIdentity.test.ts
tests/server/calendarProviderResilience.test.ts
tests/server/calendarReadAuth.test.ts
tests/server/calendarWindow.test.ts
tests/server/helpers/householdAccess.ts
tests/server/helpers/providerEnvironment.ts
tests/server/householdAccessBoundary.test.ts
tests/server/householdPrivacyApi.test.ts
tests/server/productionTopology.test.ts
tests/server/providerPrivacy.test.ts
```
