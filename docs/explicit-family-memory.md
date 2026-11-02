# AI-1D — Explicit Family Memory

Baseline: `edd079ece1238ccb77dc2e297b5bca40d1acdfd6`.

Explicit/confirmed Memory extends the existing Family Knowledge file. It is not
inference, an operational data mirror, Profile, family relationships, permissions,
Context Retrieval or Copilot. There is no model/provider integration or new UI.

## Identity, capture and access

Memory has exactly one canonical subject: `{kind:"HOUSEHOLD"}` or
`{kind:"MEMBER",memberId}`. Identity remains owned by `config/household.json`.
Inactive members remain valid historical subjects; names, aliases and `family`
are not MemberIds. No identity is generated or copied into Memory.

All six Memory endpoints use AI-1B HOUSEHOLD classification (71 total API endpoints).
Live store access still requires the server-issued capability before file access.
Defined subject/supplier positions are checked by the existing boundary. A supplied
current provenance member must be active; existing provenance remains resolvable
if that member later becomes inactive. Suppliers are attribution, not authenticated
actors. Selection/memberType/Memory responsibility never grants access.

Only `EXPLICIT` and `CONFIRMED` provenance is accepted, with a nonempty retained
source statement. No inferred drafts, automatic promotion, background capture or
operational-domain importer exists. Source attribution and confirmation are explicit
caller declarations, not proof of a physical actor's identity. Household-only
access is unchanged; this phase adds no authentication.

## Envelope and compatibility

The six top-level envelope fields remain unchanged:

```ts
{
  schemaVersion: 3,
  householdId: string,
  revision: number,
  profiles: Profile[],       // unchanged AI-1C model
  relationships: Relationship[], // unchanged AI-1C model
  memories: FamilyMemory[]
}
```

Schema 1 remains valid only as the original empty revision-0 envelope. Schema 2
remains valid only with empty `memories`. Schema 3 permits validated Memory records.
Reads never rewrite any version. Profile/Graph writes on old envelopes still
produce schema 2. The first successful **Memory mutation** publishes schema 3;
all later Profile/Graph/Memory writes preserve the complete schema-3 contents.

Canonical config schema 2, runtime layout 3, migration journal, ten-file snapshot
inventory and identity-preserving restore remain unchanged. Runtime/snapshot
validation checks Memory references against that payload's canonical registry.
Household mismatch, corrupt/missing primary or unsupported schemas fail closed,
without backup fallback or repair. AI-1A migrations still create the same empty
schema-1 envelope. No new runtime migration or database is introduced.

## Exact Memory structure

```ts
type FamilyMemory = {
  id: string; // server UUID v4, a knowledge entity, never a person identity
  type: MemoryType;
  subject: Subject;
  assertion: {
    vocabularyVersion: 1;
    domain: MemoryDomain;
    predicate: ControlledPredicate; // must match type below
    value: TypedValue;             // exact matching shape below
  };
  context: null | {
    occasion: 'EVERYDAY'|'TRAVEL'|'CELEBRATION'|'SHOPPING'|'LEISURE';
    locationLabel: string|null;
    season: 'SPRING'|'SUMMER'|'AUTUMN'|'WINTER'|null;
  };
  displayText: string;
  audience: 'HOUSEHOLD';
  sensitivity: 'STANDARD'|'SENSITIVE';
  provenance: {
    origin: 'EXPLICIT'|'CONFIRMED';
    suppliedByMemberId: string|null;
    sourceStatement: string;
    recordedAt: string;
  };
  evidence: { statement:string; observedAt:string|null }[];
  lifecycle: 'ACTIVE'|'SUPERSEDED'|'RETRACTED'|'EXPIRED';
  validFrom:string|null; validUntil:string|null; reviewAfter:string|null;
  createdAt:string; updatedAt:string; endedAt:string|null;
  supersedes:string|null; supersededBy:string|null;
};
```

| Type | Fixed predicate | Exact value |
|---|---|---|
| PREFERENCE | PREFERS | `{topic, choice, stance:'PREFER'|'AVOID'}` |
| INTEREST | INTERESTED_IN | `{topic}` |
| VALUE | VALUES | `{principle}` |
| CONVENTION | FAMILY_CONVENTION | `{area, practice}` |
| RESPONSIBILITY | RESPONSIBLE_FOR | `{area, role:'PRIMARY'|'SHARED'|'BACKUP'}` |
| DECISION | CROSS_CUTTING_DECISION | `{area, decision, rationale, scope:'CROSS_CUTTING'}` |
| PATTERN | OBSERVED_TENDENCY | `{topic, tendency, interpretation:'TENDENCY_ONLY'}` |
| CONSTRAINT | SUBJECT_CONSTRAINT | `{topic, rule, strength:'SOFT'|'HARD'}` |

Domain is separate from type and must be one of FOOD, WORK, TRAVEL, SHOPPING,
LEISURE, ENTERTAINMENT, HOME, FAMILY, RELIGION, CHARITY, OTHER. No arbitrary predicate,
FACT, NOTE, generic key/value record, Profile/Graph predicate or operational domain
is supported. Typed value fields are bounded strings (160 characters); display and
source/evidence statements are limited to 300 characters. Context location label
is limited to 100 characters. Unknown fields are rejected throughout.

PATTERN topic is a controlled observable choice/practice vocabulary:
FOOD_CHOICE, TRAVEL_CHOICE, SHOPPING_CHOICE, LEISURE_CHOICE,
ENTERTAINMENT_CHOICE, HOME_PRACTICE. It requires 1–5 evidence statements and always
carries `TENDENCY_ONLY`. It never becomes a guaranteed current/future fact.
Personality/ability topics and guarantee flags are rejected. No process observes
or labels children or automatically records psychological judgments. Human text
is not semantically verified by an NLP/content classifier; manual capturers must
use the declared type correctly. Other Memory types allow 0–5 bounded supporting
statements. Evidence is not a copied operational record; provider/entity IDs and
operational payload fields are not accepted in its schema. Observation times, if
known, must be canonical UTC ISO and cannot be after capture time.

Hard constraints require explicit strength and explicit/confirmed provenance just
like soft ones; identity, religion, behaviour and classification never generate
hard constraints. Responsibility roles are declarations, not ACLs. Decisions
require CROSS_CUTTING scope; project/domain operational decisions belong to their
authoritative domain, not this API. Existing Profile facts and Graph edges are
not imported as Memory.

## Duplicate/conflict and lifecycle rules

The structured assertion is authoritative; display text never resolves conflicts.
An active semantic slot is keyed by exact canonical subject, type, domain,
predicate, structurally canonicalized context and topic/area (principle for VALUE).
Identical values in a slot are duplicates; differing values conflict (409).
Distinct topics/principles/contexts may coexist. There is no fuzzy identity or
natural-language duplicate matching and no silent reconciliation.

Create captures ACTIVE Memory only. Supersede explicitly replaces an ACTIVE
record within the same subject/type/domain/predicate family. It creates another
ID and reciprocal supersedes/supersededBy links, preserves the old assertion,
source/evidence and creation metadata, and marks the predecessor SUPERSEDED.
A byte-equivalent editable payload is a rejected no-op. Dangling, cyclic,
self-referential or cross-family lineage is invalid. Retraction preserves the
record and marks it RETRACTED. There is no destructive delete/forget or general
metadata-edit endpoint in this phase; retraction is not deletion.

Server timestamps describe capture/transition, never invented historical facts.
Validity/review times are supplied explicitly or null. `reviewAfter` does not
expire anything. ACTIVE creation with elapsed `validUntil` is rejected. Future
validFrom is supported but not returned as a current assertion before its window.

An ACTIVE record past validUntil is omitted from ACTIVE query results without a
write. By-ID/ALL reads expose `applicability` as IN_WINDOW, NOT_YET_VALID,
PAST_VALIDITY or HISTORICAL. Applicability is temporal metadata, not a truth claim,
especially for patterns. The explicit expire action requires an ACTIVE record
with non-null validUntil at/before server time, and transitions it to EXPIRED.
Undated/early expiry is rejected; withdrawal uses retract. Expired-in-time but
still persisted ACTIVE slots must be explicitly expired/retracted/superseded
before conflicting assertions are created. Historical lifecycle filters match
stored states; ALL exposes elapsed-validity records awaiting explicit expiry.

## Revision, durability and limits

The existing shared per-file mutation queue protects Profile, Graph and Memory,
even across separately issued capabilities for the same runtime. Every mutation
requires exact expectedRevision, rereads/validates primary, validates the complete
candidate, increments revision once and uses the existing durable atomic writer.
Stale/rejected/no-op changes leave primary, backup and revision unchanged. No new
memory cache/database, provider calls or automatic lifecycle writes are added.

The existing 2 MiB physical cap is unchanged and applies across all knowledge.
At most 1,000 Memory records including history are accepted. Reads require an
explicit subject and optional exact type/domain filters, bounded page size 1–100
and offset 0–1,000. Ordering is createdAt then ID; pagination is relative to the
returned revision. Clients must reread if revision changes between pages.

Existing 0600 temporary files, file flush, validated primary backup, atomic rename
and platform-aware directory flush behaviour are preserved. As in AI-1C, an I/O
failure after publication can have an uncertain commit outcome; reread revision
before retrying. No backup is silently selected as authority. Offline snapshot,
restore, server ownership and interrupted-write recovery retain their contracts.

## API

All paths below are under `/api/family-knowledge` and HOUSEHOLD-classified.

| Method | Suffix | Input |
|---|---|---|
| POST | `/memories/query` | Explicit query below |
| GET | `/memories/:memoryId` | No body; returns retained record and applicability |
| POST | `/memories` | `{expectedRevision, memory}` |
| POST | `/memories/:memoryId/supersede` | `{expectedRevision, memory}` |
| POST | `/memories/:memoryId/retract` | `{expectedRevision}` |
| POST | `/memories/:memoryId/expire` | `{expectedRevision}` |

Memory input contains type, subject, assertion, context, displayText, audience,
sensitivity, provenance (without recordedAt), evidence, validFrom, validUntil and
reviewAfter. IDs, lifecycle, links and capture/transition timestamps are server-owned.

```ts
{
  subject: Subject,
  type: MemoryType|null,
  domain: MemoryDomain|null,
  lifecycle: 'ACTIVE'|'SUPERSEDED'|'RETRACTED'|'EXPIRED'|'ALL',
  limit: number,
  offset: number
}
```

Queries return revision, matching records with applicability, truncated and
nextOffset. Reads are structured exact filtering, not semantic search, relevance
ranking, Graph traversal or AI-1E Context Retrieval. Mutations return revision and
result. Error responses use fixed generic codes; no raw statements/payloads/paths
are logged. AI-1B assertions, audit and capability errors remain intact.

## Rollback and office acceptance

Schema-1/2 reads and snapshots remain compatible and byte-preserving. Once schema
3 has been published, an older AI-1C release cannot read it. Application rollback
requires the compatible, verified pre-Memory runtime/snapshot; never edit the
schema number or discard Memory to force old validation. Snapshot restore returns
its captured revision/content; restart/reload clients after offline restoration.

On a private office runtime copy only: create Household/Member memories, exercise
all types, supersede/retract, test a short explicit expiry interval, query current
and historical records, reject duplicate/conflicting/stale writes, verify inactive
subjects, check Demo/foreign household denial, and snapshot/restore populated Memory.
Confirm source/evidence survive transitions and Profile/Graph remain unchanged.
No management UI, credentials or provider setup is required. Nothing is deployed
or changed in production by this feature.

## Implementation validation

- Server regression suite: 278/278, including 34 focused Memory tests and existing
  AI-1B access/AI-1C Profile/Graph tests.
- Runtime/configuration/migration/snapshot/restore suite: 148/148.
- Operational Routines/Rewards/Lists/Meals/Kumon regressions: 211/211.
- Calendar regressions: 96/96; focused client regressions: 30/30.
- Household frontend production build and server TypeScript build passed.
- `git diff --check` passed.

The first runtime run overlapped other suites and two tests that compare the
entire temporary-directory inventory failed as those other suites created/deleted
fixtures. The unchanged runtime suite passed all 148 tests when run alone.

Changed implementation inventory: `familyMemorySchema.ts` (new),
`familyKnowledgeSchema.ts`, `familyKnowledgeStore.ts`, `familyGraph.ts`,
`access/memberContext.ts`, `routes/familyKnowledge.ts`,
`tests/server/familyMemory.test.ts` (new),
`tests/server/householdAccessBoundary.test.ts`, and this document.
No repository operational data, production configuration or frontend implementation
was changed.
