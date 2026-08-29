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

# Environment Variables

## Frontend

Create

```
app/.env
```

```env
VITE_API_BASE_URL=http://localhost:3001
VITE_EY_MODE=household
```

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

- **Household mode** is the primary mode for the wall-mounted 32-inch Elo touchscreen. It requires a private local household configuration.
- **Demo mode** is the safe public/GitHub Pages mode. It uses tracked example data and never loads private household values.

Local development defaults to Household mode. Production builds default to Demo mode unless `VITE_EY_MODE` is explicitly set.

To configure the household installation:

1. Copy `app/src/config/household.example.json` to `app/src/config/household.local.json`.
2. Add the real household members, address, location, destinations and calendar endpoint locally.
3. Keep `household.local.json` private. It is ignored by Git and must never be committed.
4. Restart `npm run dev` after changing configuration.

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

Use stable, non-identifying IDs such as `adult-1` and `child-1`. The real display names stay only in the ignored local file. Demo mode uses the safe example profiles from `household.example.json`.

The Family profile is derived automatically from `household.displayName`. A selected member remains active only for the current page session; a page reload or application restart returns to Family. Profile selection is context only. `memberType` is descriptive metadata and does not authenticate an adult or grant permissions.

If Household mode is selected without the private local file, eY OS stops with a clear configuration error instead of silently showing demo data.

Do not store API keys, OAuth tokens, passwords or other credentials in the household JSON file. Secrets belong in ignored environment files or the backend.

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
