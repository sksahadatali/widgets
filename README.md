# eY OS

> **A personal operating system that brings together the information that matters, simplifies everyday life, and helps make better decisions.**

---

# Vision

eY OS is a personal dashboard designed to become the single place for managing daily life, family, home, business and personal productivity.

Instead of switching between multiple apps, eY OS presents the information that matters most and helps users make better decisions.

### Core Principles

- **Inform** – Surface the right information at the right time.
- **Simplify** – Reduce complexity and context switching.
- **Decide** – Provide meaningful insights and recommendations.
- **Act** – Enable quick actions from one place.

---

# Current Features

## Live Services

- ✅ Weather
- ✅ Prayer Times
- ✅ Google Calendar
- ✅ GBP → MAD Exchange Rate
- ✅ Google Nest Thermostat

## Dashboard

- ✅ Home Dashboard
- ✅ Quick Status
- 🚧 Today's Brief
- 🚧 Today's Focus

---

# Technology Stack

## Frontend

- React
- TypeScript
- Vite
- Lucide React
- CSS Modules

## Backend

- Express
- TypeScript
- Google OAuth 2.0
- Google Smart Device Management API

## External APIs

- Open Meteo
- Google Calendar
- Google Nest SDM API
- Exchange Rate API

---

# Project Structure

```text
widgets/
│
├── app/                       # React application
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── pages/
│   │   └── styles/
│
├── server/                    # Express API
│   ├── src/
│   │   ├── config/
│   │   ├── routes/
│   │   ├── services/
│   │   └── server.ts
│
├── docs/
│
├── package.json               # Starts frontend & backend
├── start-ey-os.bat
│
└── README.md
```

---

# Getting Started

## Prerequisites

- Portable Node.js

Example location

```
C:\Tools\node
```

---

## Installation

From the project root

```bash
npm install
```

---

## Running eY OS

Start both the frontend and backend

```bash
npm run dev
```

or simply run

```
start-ey-os.bat
```

The development server starts:

Frontend

```
http://localhost:5173
```

Backend

```
http://localhost:3001
```

Keep the terminal window open while developing.

---

## Running the local production service

The production topology serves the compiled React application and the
existing Express APIs from one origin. From the project root,
build and start it with:

```bash
npm run build:production
npm run start:production
```

Open:

```text
http://localhost:3001/
```

The production service is loopback-only by default:

```env
EYOS_BIND_HOST=127.0.0.1
EYOS_TRUSTED_LAN_ACCESS=false
```

To make the same application and APIs available to the Elo display and an
Android phone on the same trusted private home LAN, explicitly set both:

```env
EYOS_BIND_HOST=0.0.0.0
EYOS_TRUSTED_LAN_ACCESS=true
```

LAN mode is unauthenticated. Household Profiles are not authentication, and
every device that can reach the service can call its read and mutation APIs.
Use the Home PC's private IPv4 address, for example
`http://192.168.1.20:3001`, and keep `VITE_API_BASE_URL` empty so React uses
same-origin `/api` requests. eY OS does not discover or print the PC address.

On Windows, classify the home network as **Private** and create a narrowly
scoped inbound rule for TCP port `3001`, the **Private** firewall profile and
remote scope `LocalSubnet`. Keep Android on the same trusted, non-guest Wi-Fi.
Never enable the rule for the Public profile, disable Windows Firewall, use
router port forwarding or UPnP, or expose this unauthenticated HTTP service to
the internet. Firewall configuration remains an explicit deployment step;
eY OS never changes it.

## Continuous Windows home-host service

The HS4B deployment foundation is documented in
`deployment/windows/README.md`. It uses pinned WinSW 2.12.0 under
`C:\Program Files\eY-OS`, runs as `LocalService`, and reads its private
environment from the explicit external `EYOS_SERVICE_ENV_FILE` under
`C:\ProgramData\eY-OS`. It records the current and two previous validated
application releases so code can be rolled back independently of Household
data. These tools never migrate, initialize, back up, restore or roll back
`EYOS_RUNTIME_DIR`; `C:\ProgramData\eY-OS\runtime` is only a possible future
Home-PC location requiring a separate controlled migration.

Production builds fail if `VITE_API_BASE_URL` is nonempty. The deployed React
application therefore continues to call same-origin `/api`, including from
another device on the trusted LAN.

Vite is not required while the production service is running. React routes
such as `/daily`, `/rewards`, `/lists`, `/meals` and `/settings` support
direct navigation and reload through the production application fallback.
Existing APIs remain under `/api/*`, and unknown API routes always return a
JSON 404 rather than the React application.

Production builds default to Demo mode. To build the private Household
application, set `VITE_EY_MODE=household`, set `EYOS_RUNTIME_DIR` in
`server/.env` to the initialized external runtime root, configure provider
secrets in the server environment, and leave `VITE_API_BASE_URL` empty so
all browser requests remain same-origin. Private Household configuration is
loaded by Express and is never compiled into the Vite application.

### External Household runtime data

Household production uses one authoritative runtime root outside the Git
checkout. `EYOS_RUNTIME_DIR` must be an absolute path to an already migrated
root with this fixed layout:

```text
<runtime-root>/
  runtime.json
  config/
    household.json
  data/
    routines.local.json
    rewards.local.json
    redemptions.local.json
    lists.local.json
    meals.local.json
    kumon.local.json
```

The manifest is versioned independently from the six unchanged domain-store
schemas. Production validates the manifest, directory access, and every
primary store before the API routers or startup reconciliation are loaded.
Missing, partial, malformed, relative, checkout-local, unreadable, or
unwritable runtime data stops Household production. It never falls back to
`server/data` and never creates an empty production store. A valid `.bak`
does not override an invalid primary; restoration is deliberately outside
Home Service 2A and all files remain untouched on failure.

Migrate an existing initialized Household only while eY OS is stopped. The
target path and its parent are explicit; the target itself must not exist:

```bash
npm run runtime:migrate --prefix server -- --source "<absolute-server-data-path>" --target "<absolute-runtime-root>"
npm run runtime:validate --prefix server -- --root "<absolute-runtime-root>"
```

Migration is copy-only. It validates the complete source set, copies into a
temporary sibling directory, verifies each primary with SHA-256, validates
the copied stores, writes the manifest last, and atomically publishes the
whole root. It neither copies `.bak` evidence nor changes/deletes the source.
It refuses an existing target and provides no clean-install initialization.

After the six stores are present, copy an existing ignored Household
configuration into the same runtime with the separate explicit command:

```bash
npm run runtime:config:migrate --prefix server -- --source "<absolute-household.local.json>" --root "<absolute-runtime-root>"
```

The command validates the legacy source, retains it unchanged, stages and
validates the independently versioned `config/household.json`, and publishes
the configuration directory atomically. It refuses an existing target and
never changes `data/*`. Household production fails before listening if this
configuration is missing or invalid.

Development remains compatible with repository-local `server/data` and its
existing first-use initialization when `EYOS_RUNTIME_DIR` is absent. If an
external root is explicitly supplied during development it is strict and
required. Demo production reads `eyos-build.json`, disables all six server
datastores, and does not require or access an external runtime root.

The local production service provides only explicitly enabled trusted private
LAN access. It deliberately does not provide HTTPS, authentication, remote or
public-internet access, process management, scheduled/off-device backup or PWA
behavior. Those belong to later Home Service phases.

### Local validated snapshots

Home Service 3A provides offline, whole-runtime snapshots for an initialized
external Household runtime. Stop eY OS before creating a snapshot. Household
production holds an exclusive sibling operation lock for its full process
lifetime, so snapshot creation fails closed while the service is running.

The backup root must be an existing local absolute path outside the runtime.
Local Windows drive-letter and POSIX paths are supported. Relative, UNC,
network, Windows device-namespace, checkout-contained and mutually contained
runtime/backup paths are rejected.

```bash
npm run runtime:backup:create --prefix server -- --root "<absolute-runtime-root>" --backup-root "<absolute-backup-root>"
npm run runtime:backup:verify --prefix server -- --snapshot "<absolute-snapshot-directory>"
npm run runtime:backup:list --prefix server -- --backup-root "<absolute-backup-root>"
```

Each atomically published snapshot contains exactly `runtime.json`, external
`config/household.json`, and the six primary `data/*.local.json` stores. Its
strict manifest records byte sizes and SHA-256 checksums, and creation performs
an independent verification before reporting success. Per-store `.bak` files,
temporary files, secrets and repository migration evidence are deliberately
excluded. Verification and listing are strictly read-only.

A failed audit append after publication does not invalidate or remove the
verified snapshot; the create command reports a degraded-audit warning. An
interrupted operation may leave a staging directory or stale operation lock,
but staging is never listed as a snapshot and startup never clears a lock or
selects backup data automatically.

Inspect a lock before taking administrative action:

```bash
npm run runtime:operation:inspect --prefix server -- --root "<absolute-runtime-root>"
```

Only after confirming that no eY OS or snapshot process is running, clear a
recorded stale lock with its exact operation ID and an explicit audit target:

```bash
npm run runtime:operation:clear --prefix server -- --root "<absolute-runtime-root>" --backup-root "<absolute-backup-root>" --operation-id "<exact-id>" --confirm-clear
```

For an ownerless/malformed lock use `--confirm-orphaned-lock` instead. Locks
are never cleared automatically. HS3A does not provide pruning, scheduling,
encryption or off-device export, and Git/GitHub must never store real
Household snapshots.

### Explicit whole-runtime restore

Home Service 3B provides an offline administrative restore of all eight
authoritative runtime files from one independently verified HS3A snapshot.
Stop eY OS first. Restore requires the exact snapshot ID twice:

```bash
npm run runtime:restore --prefix server -- --root "<absolute-runtime-root>" --backup-root "<absolute-backup-root>" --snapshot "<snapshot-id>" --confirm-restore "<same-snapshot-id>"
```

A valid current runtime first receives a mandatory, independently verified
pre-restore snapshot. The complete replacement is staged and validated before
rename publication. The former valid runtime remains in a sibling
`.displaced-<operation-id>` directory through final verification; invalid or
incomplete input is accepted only with `--confirm-invalid-runtime` and remains
as separate `.invalid-evidence-<operation-id>` evidence. An absent input
requires `--confirm-absent-runtime`. Restored runtime files never inherit old
`.bak` files. Cleanup of displaced/evidence directories is deliberately not
part of HS3B.

An interrupted destructive restore retains its restore lock and sanitized
sibling journal, and production startup fails closed. The version-2 journal
records an explicit decision plus intent/completion for each atomic transition.
Recovery first classifies the journal, filesystem and independently verified
snapshot evidence without mutation; unsupported combinations fail with
`RESTORE_STATE_AMBIGUOUS`. Inspection is read-only:

```bash
npm run runtime:restore:inspect --prefix server -- --root "<absolute-runtime-root>"
```

Recovery is always an explicit choice using the exact operation ID:

```bash
npm run runtime:restore:recover --prefix server -- --root "<absolute-runtime-root>" --backup-root "<absolute-backup-root>" --action "<abort|rollback|complete>" --operation-id "<exact-id>" --confirm-recover
```

`complete` mutates nothing unless the journal, filesystem and independently
verified selected snapshot establish exactly one safe continuation. Persisted
forward, rollback and abort decisions cannot be changed by later retries.
Restore never runs automatically,
never selects a snapshot by recency, and does not provide per-domain restore,
retention, remote administration or a web UI.

On a validated Windows production release, invoke the compiled scripts with
the bundled Node executable under `C:\Program Files\eY-OS\current`; production
restore does not depend on `tsx`. See `deployment/windows/README.md` for the
exact command and the separately administered `LocalService` inheritance
requirement for the runtime parent. eY OS never changes runtime ACLs.

---

# Environment Variables

## Frontend

Create

```
app/.env
```

```env
VITE_EY_MODE=household
```

Frontend eY OS API calls use same-origin `/api` paths. During local
development, Vite proxies those requests to `http://localhost:3001`.
`VITE_API_BASE_URL` is an optional centralized override for environments
that cannot use the preferred same-origin deployment.

---

## Backend

Create

```
server/.env
```

```env
NEST_CLIENT_ID=
NEST_CLIENT_SECRET=
NEST_REFRESH_TOKEN=
NEST_PROJECT_ID=
NEST_DEVICE_NAME=
```

---

# Household and Demo Configuration

eY OS supports two configuration modes:

- **Household mode** is the primary mode for the wall-mounted 32-inch Elo touchscreen. Production requires external private runtime configuration.
- **Demo mode** uses tracked synthetic client configuration and never reads the Household runtime.

Local development defaults to Household mode. Production builds default to Demo mode unless `VITE_EY_MODE` is explicitly set.

For development without `EYOS_RUNTIME_DIR`, the ignored local file remains a
server-side input only:

1. Copy `app/src/config/household.example.json` to `app/src/config/household.local.json`.
2. Add the real household members, address, location, destinations and calendar endpoint locally.
3. Keep `household.local.json` private. It is ignored by Git and must never be committed.
4. Restart the backend after changing configuration.

Household members belong inside the existing `household` section:

```json
{
  "household": {
    "displayName": "Your household display name",
    "members": [
      {
        "id": "adult-1",
        "displayName": "Preferred adult name",
        "memberType": "adult"
      },
      {
        "id": "child-1",
        "displayName": "Preferred child name",
        "memberType": "child"
      }
    ]
  }
}
```

Use stable, non-identifying IDs such as `adult-1` and `child-1`. In production,
the real values live only in external `config/household.json`. React receives
an explicit projection containing display names, member types, timezone,
leave buffer and Calendar refresh interval. Addresses, coordinates, provider
endpoints, raw Calendar identities and semantic matching rules remain on the
server. Settings intentionally retrieves the home address through a separate
no-store presentation endpoint.

The Family profile is derived automatically from `household.displayName`. A selected member remains active only for the current page session; a page reload or application restart returns to Family. Profile selection is context only. `memberType` is descriptive metadata and does not authenticate an adult or grant permissions.

If Household mode lacks valid configuration, eY OS fails closed instead of
silently showing Demo data. Household Profiles remain UX context rather than
authentication or authorization, and the service must not be exposed directly
to the Internet.

Do not store API keys, OAuth tokens, passwords or other credentials in the household JSON file. Secrets belong in ignored environment files or the backend.

Calendar source labels are configured only in the ignored local household file. Add an optional `calendar.sources` array with a stable safe `sourceId`, a display `label`, a generic `kind`, and either the exact provider `calendarName` or private `calendarId` used for matching. Multiple provider calendars can map to the same safe source, for example `sourceId: "school"`, `label: "School"`, and `kind: "school"`. Keep real calendar names and provider IDs out of the tracked example configuration.

School-source events can optionally be classified for Today's Brief with private `calendar.semanticRules`. A rule uses the safe configured `sourceId`, exactly one case-insensitive `titleEquals` or explicitly chosen `titleIncludes`, one of `school.training-day`, `school.holiday` or `school.reopens`, and an optional short `label`. Exact-title rules take precedence over contains rules. An editable event description may instead contain a validated `eyos.kind=...` line and optional `eyos.label=...` line; valid markers take precedence over private rules. Unsupported or malformed markers and ambiguous rules remain semantically unclassified. Keep real academic-event titles and mappings only in the ignored local file.

```json
{
  "calendar": {
    "semanticRules": [
      {
        "sourceId": "school",
        "titleEquals": "Example training day",
        "kind": "school.training-day",
        "label": "Training Day"
      }
    ]
  }
}
```

## Family Routines

The Daily area provides three shared routine views:

- **Today** shows scheduled Family routines and, when a household member is selected, that member's routines alongside Family routines.
- **Manage Routines** creates, edits, activates, deactivates and permanently deletes routine definitions.
- **History** lazily loads past materialised occurrences and derives recorded progress from their immutable snapshots. It never fabricates records for dates when eY OS was not running.

Household mode stores real routine definitions and occurrence completion history in:

```text
server/data/routines.local.json
```

The file is created automatically on first use and is ignored by Git. Before replacing a valid primary file, the server retains one previous valid copy as:

```text
server/data/routines.local.json.bak
```

Both files, and temporary atomic-write files, are ignored. Writes validate the current store, write a temporary file, retain the backup and atomically rename the temporary file. If the primary store is malformed, the API returns a clear error and does not overwrite it.

The current routine store uses schema version 3. A valid schema-v2 primary is automatically migrated to v3 by adding `reward: null` to definitions, `rewardContract: null` to existing occurrences and a completion sequence derived from the existing captured-step state. This is deliberately non-retroactive: migrated occurrences cannot create automatic Rewards. Valid schema-v1 stores first receive their immutable snapshots and then the same v3 defaults. Existing completion timestamps and `completedAt` values are preserved. The valid pre-migration primary is retained as the `.bak` recovery point and is not rotated during that migration operation. Normal backup rotation resumes only after the migrated v3 primary has subsequently been loaded and validated. A malformed or unsupported primary is never migrated or overwritten.

Each scheduled active routine is materialised once for the current household-local date, regardless of the selected profile. Its title, assignment, schedule and ordered steps are snapshotted and remain fixed. Definition edits apply to the next occurrence that has not yet been materialised. Completion timestamps remain editable through checklist completion and reopening. Days when eY OS was not running are not fabricated or backfilled.

Routine status is derived from the configured household IANA timezone and is never stored. Untimed routines show **Today**; timed routines move through **Upcoming**, **Due** and **Overdue**; fully completed occurrences show **Completed**. A partially completed due routine may display **In progress**.

Today's Focus can surface incomplete routine occurrences that require attention without duplicating recurrence, profile visibility or completion logic. Overdue, Due, In-progress and untimed Today routines are eligible; Upcoming routines enter the shared ranking only within two hours of their snapshotted start time. At most three routine candidates enter the existing four-item Focus ranking, so routines continue to compete with Tasks, Calendar, Prayer, Weather and context signals. Selecting a routine Focus item opens its exact materialised occurrence in Daily. This attention state is derived in memory and creates no Focus cache, schema change or additional persistence.

Routine History continues to read the same immutable occurrence snapshots in schema version 3. It reads the existing occurrence archive only while the History tab is open and keeps Household history in memory only. Historical title, assignment ID, schedule and ordered steps always come from the immutable occurrence snapshot. Completed means every captured step is currently complete; Partial means some but not all captured steps are complete; Missed means a past recorded occurrence has no completed captured steps. Today is excluded from historical outcome metrics.

The History summary uses the explicit label **Recorded completion rate** because its denominator contains only past materialised occurrences. A date with no occurrence is not counted as Missed: it may simply mean eY OS was not running. History therefore describes recorded routine activity, not complete schedule adherence. Streaks, adherence scores and perfect-day metrics are intentionally unsupported by the current no-backfill model.

History follows the selected Household Profile using each occurrence's snapshotted assignment. Family sees Family plus configured member history; an individual sees Family plus their own history. Profile selection remains context rather than authentication or authorization.

Demo mode is isolated from the household store. It starts with safe tracked schema-v3 examples and saves Demo changes only in the browser's `ey-os-demo-routines-v3` local-storage entry. Valid older `ey-os-demo-routines-v1` and `ey-os-demo-routines-v2` entries are migrated independently and non-retroactively; Household mode never reads any Demo entry.

Fresh Demo mode is not seeded with manufactured history. Demo History therefore contains only synthetic occurrences that the Demo session has actually materialised and retained in its isolated browser store.

### Restoring the routines backup

1. Stop `npm run dev` so the backend cannot write during recovery.
2. Keep the malformed `server/data/routines.local.json` for diagnosis by renaming it to a non-tracked local filename such as `routines.local.json.corrupt`.
3. Copy `server/data/routines.local.json.bak` to `server/data/routines.local.json`.
4. Restart `npm run dev`, open **Daily**, and verify the recovered routines before making further changes.

If the restored backup is a protected schema-v1 or schema-v2 migration copy, startup validates and migrates it to schema v3 again.

Occurrence history remains unpruned. The local store can therefore grow without limit over time, and immutable snapshots increase that growth. History initially renders at most 50 matching records and offers an accessible **Show more** control, but this does not reduce the underlying JSON-store size. A future retention or storage policy can operate in the persistence layer without changing the routine or occurrence domain model.

Deactivation is the normal non-destructive way to stop a routine. Permanent deletion requires confirmation and removes both the routine definition and every recorded occurrence for it.

## Family Rewards ledger foundation

Rewards use an independent append-only Household ledger at:

```text
server/data/rewards.local.json
```

The schema-v1 store contains immutable transactions rather than a separately mutable balance. Balances are always derived by summing validated `star` transaction amounts for each stable non-Family profile ID. The ledger accepts JavaScript safe integers and deliberately has no 100-star accounting maximum; a future user interface may apply a smaller product limit without changing the ledger invariant.

The foundation exposes read, positive-award and audit-preserving reversal primitives. It has no balance setter, transaction update/delete operation or unrestricted signed-transaction endpoint. Reversing a transaction appends one exact linked opposite transaction while retaining the original. Event keys make equivalent retries idempotent and reject conflicting reuse.

The top-level Rewards workspace presents ledger-derived child balances and recent activity. Family context shows current children's combined activity, child context shows only that child's balance and history, and adult context also exposes Manual Parent Awards and explicit award reversal. Profile selection is context only: it is not authentication or authorization.

Manual Parent Awards accept a currently configured child recipient, an integer from 1 to 100, one of the six initial categories, and a required trimmed reason of at most 160 characters. The 1–100 limit belongs only to this operation; the underlying ledger retains its broader safe-integer bound. A stable `manual-award:<requestId>` event key is retained across retries. Household award reasons remain in the ignored server ledger and are not logged, sent to Today Brain, stored in browser storage or copied into Demo data.

Demo mode uses an in-memory disposable copy of the tracked synthetic Rewards example. Demo mutations never call or fall back to the Household API and reset when the application restarts.

Routine definitions may configure a 1–100 star automatic reward for a currently configured child. Each new materialised occurrence captures that recipient, currency and amount as an immutable `rewardContract`; later definition or profile changes cannot alter it. Existing migrated occurrences have a null contract and are never rewarded retroactively. Completing the whole captured checklist appends one deterministic Routine award. Reopening appends an exact reversal, and recompleting advances the occurrence completion sequence and appends a new award. At most one completion sequence for an occurrence may have an unreversed award.

Routine and Rewards stores are intentionally independent rather than a cross-file transaction. A valid Routine completion or reopen is never rolled back when the Rewards store is unavailable. Idempotent reconciliation repairs pending awards or reversals after the mutation, when the Routine provider loads, and when the backend starts. Only occurrences with an explicit captured reward contract participate. Automatic awards use the captured stable recipient ID even if that member is later removed; they are never redirected to Family or another member.

Every mutation is serialized within one backend process, rereads and validates the authoritative primary, validates the complete resulting ledger, writes a temporary file and atomically renames it. Before replacing an existing valid primary, the server retains one previous valid copy at:

```text
server/data/rewards.local.json.bak
```

The primary, backup and temporary files are ignored by Git. A malformed or unsupported store fails safely and is never reset, repaired or copied over the valid backup. Household Reward content is never stored in browser local storage. Demo mode uses only the small tracked synthetic `rewards.example.json` store and never calls or falls back to the Household Rewards API.

### Restoring the Rewards backup

1. Stop `npm run dev` so the backend cannot write during recovery.
2. Preserve the malformed `server/data/rewards.local.json` for diagnosis by renaming it to an ignored name such as `rewards.local.json.corrupt`.
3. Copy `server/data/rewards.local.json.bak` to `server/data/rewards.local.json`.
4. Restart `npm run dev` and verify `GET http://localhost:3001/api/rewards` returns the expected transaction count and derived balances before attempting another Reward mutation.

The JSON store is designed for one Node backend process. It does not provide multi-process file locking, multi-host synchronization, cloud persistence, pruning or pagination. Reward history therefore grows without an automatic retention limit.

## Reward catalogue and requests

Rewards 1D-A adds a separate private Household store for catalogue definitions and non-financial redemption requests:

```text
server/data/redemptions.local.json
```

Its schema-v1 catalogue uses stable UUIDs, an item name, optional description, active state and an integer cost from 1 to 500 stars. The 500-star limit belongs only to the Redemption domain and does not change the broader safe-integer Rewards-ledger invariant. Catalogue array order is display order. Deactivation is the normal non-destructive way to stop new requests.

Creating a request captures the item's ID, name, description, currency and cost as an immutable `RedemptionContract`. Later catalogue edits, reordering or deactivation cannot change that captured request. A child-profile context can request only for itself and can cancel its own still-pending request. Adult-profile context can decline a pending request. Family context can browse but cannot request because it does not identify which child would redeem the item. Profile selection and `memberType` remain context rather than authentication.

Requests persist an immutable original record plus at most one explicit `cancelled` or `declined` closure. Stable request/cancel/decline event keys make equivalent retries idempotent and reject conflicting transitions. Closed requests are retained and cannot reopen. Renamed profiles stay connected by stable ID; removed-profile requests are retained for adult context and reconnect if the same ID is restored.

Rewards 1D-A is deliberately non-financial. Catalogue creation/editing/deactivation/reordering and request creation/cancellation/decline do not deduct, reserve, reverse or reconcile stars and never write to `rewards.local.json`. Adult approval, redemption ledger transactions and refunds belong to a later separately reviewed phase.

Before replacing an existing valid Redemption primary, the backend retains one previous valid copy at:

```text
server/data/redemptions.local.json.bak
```

The primary, backup and atomic-write temporary files are ignored by Git. A missing store creates an empty schema-v1 store on first use. A malformed or unsupported primary fails safely and is never overwritten or replaced with Demo data. Demo mode uses only a disposable in-memory copy of tracked synthetic `redemptions.example.json` data; it never calls or falls back to the Household Redemption API.

### Restoring the Redemption backup

1. Stop `npm run dev` so the backend cannot write during recovery.
2. Preserve the malformed `server/data/redemptions.local.json` by renaming it to an ignored diagnostic name such as `redemptions.local.json.corrupt`.
3. Copy `server/data/redemptions.local.json.bak` to `server/data/redemptions.local.json`.
4. Restart `npm run dev`, open **Rewards**, and verify the recovered catalogue and requests before making another change.

## Family Lists

The **Lists** destination provides multiple shared household lists with an automatically created Shopping list. Shopping has an immutable `systemKey: "shopping"`, so it may be renamed without breaking the future Meal Planning integration boundary. Lists remain separate from Tasks, Routines and Rewards.

Household Lists use an independent private schema-v1 store:

```text
server/data/lists.local.json
```

The first read creates one empty Shopping list. List and item array order is persisted, and accessible Move Up/Move Down controls change that order. Items deliberately contain only a title; text such as `Milk × 2` stays lightweight title text rather than quantity or inventory data. `addedByProfileId` records the selected stable Household Profile ID as descriptive attribution only and grants no ownership or permission.

Checked items remain available in a collapsed Checked section until they are unchecked, individually removed, or removed with the explicitly confirmed **Clear checked** action. There is no automatic pruning, completed-item archive or item history in Phase 1. Lists may be archived and reactivated, but are not permanently deleted.

Writes are serialized within the single backend process, re-read the authoritative primary, validate a cloned result, create a unique temporary file, retain the previous valid primary at:

```text
server/data/lists.local.json.bak
```

and atomically replace the primary. The primary, backup and temporary files are ignored by Git. A malformed or unsupported primary fails safely and remains byte-for-byte untouched; Household mode never falls back to Demo data.

Demo mode uses only a disposable in-memory clone of the tracked synthetic `app/src/data/lists.example.json` fixture. Demo Lists persist while the current SPA is running and reset on full reload or restart. Demo never calls the Household Lists API or reads the Household store.

### Restoring the Lists backup

1. Stop `npm run dev` so the backend cannot write during recovery.
2. Preserve the malformed `server/data/lists.local.json` for diagnosis by renaming it to an ignored filename such as `lists.local.json.corrupt`.
3. Copy `server/data/lists.local.json.bak` to `server/data/lists.local.json`.
4. Restart `npm run dev`, open **Lists**, and verify Shopping, other lists and their items before making another change.

The JSON store is designed for one Node backend process. It does not provide multi-process locking, real-time synchronization, cloud persistence, history, or automatic checked-item cleanup.

## Meal Planning

The **Meals** destination provides one shared rolling seven-day household plan, starting at household-local Today, with Breakfast, Lunch and Dinner slots. Entries are plain titles tied to household-local calendar dates; no week containers, profile ownership, recipe data, ingredients or Lists integration are stored. Previous and Next move the selected window by seven calendar days without deleting historical meals.

### Kumon daily homework

The **Daily → Today** workspace includes a small Kumon capability for date-specific Maths and English homework. An adult profile can assign a child a human-readable worksheet label and an explicit total number of units for the current Household civil date. Adult profiles and the owning child profile can update progress with absolute unit totals, complete the assignment, and reopen it by reducing progress. Family is an all-children read-only overview; a child sees only their own records.

Kumon owns its assignment and progress state. It does not create Tasks, complete Routine steps, award stars, or enter Home, Today’s Brief or Today’s Focus. Recent history shows today and the previous six Household dates without generating or carrying work forward.

Household data is stored privately in `server/data/kumon.local.json`, with versioned validation, serialized atomic writes and a previous-valid-file backup. Demo mode never calls this Household store and uses only the isolated `ey-os-demo-kumon-v1` browser entry initialized from empty synthetic data.

Household Meals use an independent private schema-v1 store:

```text
server/data/meals.local.json
```

Entry array order supplies deterministic order within each date and meal-type slot. Creates and copies append to their target slot. Moves preserve identity and creation time while appending to the destination slot. Equivalent retries and no-op updates do not rewrite the primary or rotate the backup.

Writes are serialized within the single backend process, re-read the authoritative primary, validate a clone, retain one previous valid primary at `server/data/meals.local.json.bak`, and atomically replace the primary through unique temporary files. The primary, backup and temporary files are ignored by Git. A malformed or unsupported primary remains byte-for-byte untouched, and Household mode never falls back to Demo data.

Demo mode uses only safe current-window-relative synthetic meals in a disposable in-memory store. Demo state lasts for the current SPA session and resets on full reload. It never calls the Household Meals API or reads the Household store.

### Restoring the Meals backup

1. Stop `npm run dev` so the backend cannot write during recovery.
2. Preserve the malformed `server/data/meals.local.json` for diagnosis by renaming it to an ignored filename such as `meals.local.json.corrupt`.
3. Copy `server/data/meals.local.json.bak` to `server/data/meals.local.json`.
4. Restart `npm run dev`, open **Meals**, and verify the recovered seven-day plan before making another change.

The Redemption JSON store assumes one Node backend process and has no pruning, pagination, cloud synchronization, authentication, approval, star reservation, fulfilment or financial reconciliation. Requests may therefore be created before the child has enough stars; the authoritative balance check belongs to the later adult-approval phase.

---

# Development Workflow

1. Run **start-ey-os.bat**
2. Keep the terminal window open
3. Edit React or Express code
4. Changes reload automatically
5. Close the terminal when finished

---

# Architecture

```
                    eY OS Dashboard
                           │
          ┌────────────────┴───────────────┐
          │                                │
     React Frontend                  Express API
          │                                │
          ├──────────────┬─────────────────┤
          │              │                 │
     Weather        Calendar         Nest API
          │              │                 │
          │         Google API      Google OAuth
          │                                │
      Open Meteo                    Google SDM
```

---

# Project Status

## ✅ Milestone 1 — Foundation

- Widget Framework
- Theme
- Service Layer
- API Client

---

## ✅ Milestone 2 — Live Integrations

- Weather
- Prayer Times
- Calendar
- Exchange Rate
- Nest Thermostat

---

## ✅ Milestone 3 — Backend

- Express Server
- Google OAuth
- Google SDM Integration
- REST API

---

## 🚧 Milestone 4 — Dashboard Intelligence

- Today's Brief
- AI Recommendations
- Smart Notifications
- Daily Priorities

---

## Planned

### Daily

- Gmail
- Shopping
- Travel
- News

### Personal

- Finance
- Health
- Family
- Faith

### RAEN

- Portfolio
- Pipeline
- Mortgages
- Tenants

### AYANOH

- Products
- Orders
- Inventory
- Suppliers

---

# Documentation

The following documents are available under the **docs/** folder.

- Vision
- PRD
- Roadmap
- Information Architecture
- User Flows
- Design Principles
- Feature Matrix
- Component Library
- Version History

---

# Development Principles

- React components remain presentational.
- Business logic lives in Hooks.
- External integrations live in Services.
- Backend abstracts third-party APIs from the frontend.
- Shared UI components are reused whenever possible.
- TypeScript is used throughout the project.

---

# Version

Current Version

**v0.3**

### Completed

- React Dashboard
- Live Quick Status
- Backend API
- Google Nest Integration

### Next

- AI-powered Today's Brief
- Task Integration
- Smart Recommendations
