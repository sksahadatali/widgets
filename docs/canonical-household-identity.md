# AI-1A canonical household identity

This release requires household configuration schema **2** and external runtime
layout **3**. Migration is explicit and offline; startup never upgrades data.
It introduces identity and an empty storage envelope only, not Profile, Graph,
Memory, Context Retrieval, permissions or AI behaviour.

## Identity contract

`config/household.json` remains the sole identity authority. `householdId` is an
opaque `hh_<UUID v4>` generated once during initial migration. Existing
`household.members[].id` values become permanent canonical member identities.
There is no second `memberId` field and no operational reference renaming.

Each member additionally has `lifecycle: ACTIVE | INACTIVE`, explicit `aliases`,
`createdAt`, and nullable `inactiveAt`. Initial migration establishes `createdAt`
using its journal timestamp, not an invented birth/join/history date. All initial
members are ACTIVE with empty aliases and null inactiveAt. Renames, aliases and
child/adult changes retain ID and createdAt. Metadata transition validation
prevents deletion/replacement of established IDs. The pure metadata helper sets
inactiveAt on retirement, preserves it through subsequent inactive edits, and
clears it on reactivation. There is no member-edit HTTP endpoint or new UI.

The loaded identity is frozen against accidental in-process mutation. A config
reload checks identity continuity; native restore checks household and member
identity continuity. Offline administrators with filesystem write access remain
trusted: this phase does not authenticate filesystem edits. Never hand-edit IDs
or delete member records. Exceptional ID repair/reference rewriting is deferred
to a dedicated future migration, not a normal metadata operation.

`family` remains a UI/domain sentinel, never a member ID. Household membership is
derived from the canonical registry; it is not persisted as graph relationships.
Active profile/assignment choices exclude inactive members. Canonical lookup and
historical display include them. Calendar defaults cannot automatically assign
inactive/unresolved members; persisted explicit assignments and other historical
operational records are retained unchanged. Identity lifecycle does not rewrite
or cancel existing routine definitions, rewards or other operational contracts.
Profile selection and adult/child classification do not establish authentication.

## Read-only preflight

Run from the repository, with absolute paths outside the checkout:

```powershell
npm run runtime:migrate:layout-3 --prefix server -- --source "<Runtime-v2>" --preflight
```

Preflight validates the v2 inventory, config schema and all seven domain stores
without initializing/writing them. It examines Routine owners, captured occurrence
owners/reward contracts, Rewards recipients/actors, Redemption recipients,
requesters and closure actors, Lists addedBy, Calendar explicit assignments/source
defaults, and legacy Kumon child references.

- BLOCKER / INVALID_RUNTIME: unsafe structure, malformed stores, duplicate or
  invalid canonical IDs, unsupported schema or links. Fix the source through its
  existing supported recovery process before migration.
- WARNING / UNRESOLVED: an exact stored member ID has no configured identity.
  The ID is reported with its field location, preserved, and never matched by
  display name or alias. Warnings do not automatically block migration.
- INFORMATION / REFERENCES_CHECKED: scan completed, with a reference count.

Keep reports private: they can contain member IDs. They do not print provider
IDs, addresses, endpoints, free-text history or secrets.

## Initial v2 to v3 migration

1. Stop the local eY OS instance owning the source. Retain its verified backup,
   runtime and compatible application release. Do not alter production during
   office acceptance.
2. Run the read-only preflight and review warnings.
3. Choose a new absent sibling target and confirm this is the **first** identity
   establishment for this household:

```powershell
npm run runtime:migrate:layout-3 --prefix server -- --source "<Runtime-v2>" --target "<Runtime-v3>" --confirm-layout-3-migration --confirm-new-household
npm run runtime:validate --prefix server -- --root "<Runtime-v3>"
```

4. Verify source preservation and target validation. A later, separately
   authorised activation changes EYOS_RUNTIME_DIR to the v3 target and uses this
   application release. Nothing in the migration changes service configuration,
   starts/restarts a service or deletes the source.
5. Create and independently verify a native v3 snapshot before normal use.

Do not use `--confirm-new-household` again for the same established household or
choose a different target to evade a failed retry. Use the original target/journal
or an established v3 identity anchor.

The migrator locks source and target using existing runtime operation locks,
rejects pending restore transactions, verifies source checksums, copies the seven
operational primaries byte-for-byte, writes the migrated config and empty envelope,
validates the complete staged target, flushes files/directories and publishes by
sibling rename. The source, including its .bak recovery evidence, is untouched.
Old .bak files are not activated as new primaries.

### Retry and recovery

Retain `.<target-name>.identity-migration.json` beside the target. It records only
source/anchor fingerprints, householdId and establishment time, not private config.
`.<target-name>.identity-staging` is owned temporary staging. Neither is inside the
source or the published runtime/snapshot inventory.

- After an ordinary failed call, rerun the **same command**. The journal reuses the
  original ID/time, verifies the source, rebuilds partial staging and validates it.
  A fully published unchanged target is verified and returned without rewriting it.
- After process termination, inspect source/target operation locks using existing
  `runtime:operation:inspect`. Only after confirming no owner is running, clear
  the exact stale migration lock with `runtime:operation:clear` and its operation
  ID/confirmation, then retry. Never clear a live or pending restore lock.
- Changed input, changed anchor, corrupt/partial journal, unowned staging or a
  modified published target fails closed. Preserve all evidence; do not delete
  the journal to generate a different ID. Restore the verified journal/source
  evidence before retry, or stop for explicit recovery review. The source remains
  usable by its previous compatible release throughout.
- A filesystem failure during journal recording cannot silently regenerate an
  identity. A damaged journal requires recovery review, not automatic repair.

## Snapshot/restore compatibility

Native v3 snapshots contain ten files: runtime manifest, household config, the
seven original primaries and `data/family-knowledge.local.json`. Existing checksum,
strict inventory, operation lock, safety snapshot and transactional restore
mechanisms apply. Native restore refuses a different household ID or loss/change
of any established member ID/createdAt. If a snapshot predates newly established
members, direct restore is blocked rather than deleting those identities; an
explicit identity-preserving recovery decision is required. An unreadable/missing
canonical config in an existing target also blocks direct restore; recover verified
identity evidence first rather than treating confirmation as permission to mint
or replace household identity.

Historical v2 snapshots remain valid nine-file snapshots. Verification/listing is
read-only and does not rewrite manifests or payloads. Normal restore rejects their
direct activation under a v3 release. Restore legacy content explicitly into a
new v3 target using an existing valid v3 runtime as the identity anchor:

```powershell
npm run runtime:backup:verify --prefix server -- --snapshot "<v2-snapshot-directory>"
npm run runtime:migrate:layout-3 --prefix server -- --snapshot "<v2-snapshot-directory>" --preflight
npm run runtime:migrate:layout-3 --prefix server -- --snapshot "<v2-snapshot-directory>" --target "<new-restored-v3-target>" --identity-from "<established-v3-runtime>" --confirm-layout-3-migration
npm run runtime:validate --prefix server -- --root "<new-restored-v3-target>"
```

The current canonical household registry (including inactive/new members) is kept
from the anchor; legacy operational content and non-identity config come from the
snapshot. A legacy configured member absent from the anchor blocks rather than
being guessed/remapped. Unknown operational IDs remain unresolved. Recover a
valid established v3 anchor first if it is unavailable; a legacy snapshot alone
cannot reconstruct an already established household ID. Snapshot bytes are never
modified, and the migration never puts locks inside the historical snapshot.

## Envelope and privacy

The envelope is exactly schemaVersion 1, the canonical householdId, revision 0,
and empty `profiles`, `relationships`, `memories`. Nonempty collections, unsupported
revision/schema and household ID mismatch fail validation without repair. There
are no knowledge APIs or runtime CRUD. Demo does not load the private household
config or access the envelope. The client receives only the existing safe config
projection plus canonical identity/lifecycle metadata, never provider configuration.

## Development and older migrations

The old unversioned example JSON is a legacy migration input, not a canonical
identity template to copy between households. Existing repository-local stores
can first use `runtime:migrate` and `runtime:config:migrate` to construct layout 2,
then this migration establishes layout 3. Existing layout 1 first uses
`runtime:migrate:layout-2`. These old commands deliberately still output layout 2.
Only after layout-3 migration does the current `runtime:validate`/startup accept
that root. Use EYOS_RUNTIME_DIR locally to exercise the full production contract.

Local file loading, if used without EYOS_RUNTIME_DIR, now also requires config v2;
use the already migrated private config, never generate a second identity on
startup. The local first-use operational-store pattern remains unchanged, but a
full AI-1A runtime-envelope acceptance test must use the external v3 root.

## Office acceptance

On private copies only: preflight; migrate; compare source/domain bytes; repeat the
same migration and verify ID stability; start with the v3 target; check Family and
member selections plus Calendar/Routines/Rewards history. Verify a retired member
is absent from new selection but remains resolvable in history, and a child/adult
metadata change retains identity. Exercise native snapshot/restore and explicit
v2 snapshot migration using a v3 anchor. Verify both mismatch rejection and Demo
isolation. Timing, provider editing, caches and operational accounting are unchanged.

## Implementation file inventory

41 files in the AI-1A feature change:

```text
README.md
app/src/components/modules/Calendar/CalendarPeoplePicker.tsx
app/src/components/routines/RoutineHistory/RoutineHistory.tsx
app/src/household/HouseholdProfileContext.tsx
app/src/household/householdProfiles.ts
app/src/household/useHouseholdProfile.ts
app/src/pages/Daily.tsx
app/src/pages/Rewards.tsx
app/src/services/householdConfigService.ts
docs/canonical-household-identity.md
server/package.json
server/src/config/householdConfig.ts
server/src/config/runtimeData.ts
server/src/identity/familyKnowledgeEnvelope.ts
server/src/identity/identityPreflight.ts
server/src/routes/calendar.ts
server/src/runtime/configMigration.ts
server/src/runtime/runtimeLayout2Migration.ts
server/src/runtime/runtimeLayout3Migration.ts
server/src/runtime/runtimeMigration.ts
server/src/runtime/runtimeRestore.ts
server/src/runtime/runtimeRestoreValidation.ts
server/src/runtime/runtimeSnapshot.ts
server/src/runtime/runtimeSnapshotInventory.ts
server/src/runtime/runtimeSnapshotManifest.ts
server/src/runtime/runtimeSnapshotValidation.ts
server/src/runtime/runtimeValidation.ts
server/src/scripts/migrateRuntimeLayout3.ts
server/src/services/calendarProfileAssignmentStore.ts
tests/calendar/calendarSemantics.test.ts
tests/client/clientConfig.test.ts
tests/client/householdProfileNavigation.test.tsx
tests/fixtures/canonicalIdentity.ts
tests/runtime/canonicalIdentity.test.ts
tests/runtime/householdConfig.test.ts
tests/runtime/runtimeData.test.ts
tests/runtime/runtimeLayout2Migration.test.ts
tests/runtime/runtimeRestore.test.ts
tests/runtime/runtimeSnapshot.test.ts
tests/server/calendarProfileAssignments.test.ts
tests/server/householdPrivacyApi.test.ts
```

## Automated validation recorded for this implementation

- `npm run test:runtime --prefix server`: **148 passed**, including 18 new
  canonical-identity/migration tests and existing runtime/config/restore coverage.
- The focused command below: **115 passed**, no failures/skips.
- `VITE_EY_MODE=household npm run build:production`: frontend production build
  and server TypeScript build passed. Server build repeated after final identity
  reload hardening; passed.
- `git diff --check`: passed.

Focused command (run from `server`, POSIX shell):

```bash
NODE_PATH=./node_modules:../app/node_modules TSX_TSCONFIG_PATH=../tests/client/tsconfig.json node --import tsx --test --test-concurrency=1 \
  ../tests/client/clientConfig.test.ts \
  ../tests/client/householdProfileNavigation.test.tsx \
  ../tests/client/calendarProfileAssignments.test.tsx \
  ../tests/client/rewardsCompactWorkspace.test.tsx \
  ../tests/client/routineWeek.test.tsx \
  ../tests/routines/routineHistory.test.ts \
  ../tests/rewards/manualRewards.test.ts \
  ../tests/server/householdPrivacyApi.test.ts \
  ../tests/server/calendarProfileAssignments.test.ts \
  ../tests/calendar/calendarSemantics.test.ts \
  ../tests/server/calendarProviderResilience.test.ts \
  ../tests/server/calendarProviderIdentity.test.ts \
  ../tests/server/calendarEventWrites.test.ts \
  ../tests/server/calendarWindow.test.ts \
  ../tests/server/providerPrivacy.test.ts
```

An initial combined test invocation omitted the server dependency directory from
NODE_PATH, so the provider-resilience test could not resolve Express. Correcting
that test invocation resolved the harness error. Tests were then run serially to
avoid competing Vite test HMR ports. No application change was made for either
harness issue. Automated checks do not replace office-laptop migration and visual
acceptance; no real runtime or production configuration was changed.
