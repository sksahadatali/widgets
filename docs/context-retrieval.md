# AI-1E — Context Retrieval

Baseline: `0bcfbd1fe888b4514566299e7690cd872335ffc6`.

This is a deterministic, read-only, purpose-driven server projection over canonical
Identity and one validated Family Knowledge envelope. It has no model dependency,
UI, operational adapter, provider call, inference, execution capability, context
persistence, context cache, background job or automatic knowledge capture.

## Access and authority

`POST /api/context/retrieve` is HOUSEHOLD-classified, with no Demo fallback.
The existing issued runtime capability is required at HTTP and live-service/store
entry. It is checked again after asynchronous reads, before projection/publication.
Client household/app-mode assertions retain AI-1B validation; matching assertions
are stripped before strict domain validation. Conflicting assertions never
establish access. Subject/profile validation precedes Family Knowledge access.

Canonical config owns identity, Profile owns descriptive facts, Graph owns explicit
family relationships, and Memory owns its typed durable assertions. Profile
selection, adult/child classification, Graph relationships and responsibility roles
never grant permission. The actor is always UNVERIFIED with null ID/role. Supplier
attribution in the underlying store is not authenticated actor identity.

No domain state is copied or queried: Meals, Calendar, Routines, Rewards, Lists,
Tasks/Notion and other operational sources are excluded. No operational store or
provider/authentication/editing code is modified.

## Request

All required fields below are mandatory; unknown fields are rejected at every
structured level. `budget` and `requireKnowledgeRevision` are optional.

```ts
{
  version: 1,
  purpose: 'MEAL_PREFERENCES' | 'CLOTHING_SHOPPING' | 'FAMILY_RELATIONSHIPS',
  subject: {kind:'HOUSEHOLD'} | {kind:'MEMBER',memberId:string},
  subjectMode: 'CURRENT' | 'RETAINED_IDENTITY',
  activeProfile: 'family' | string | null,
  applicability: null | {
    occasion: 'EVERYDAY'|'TRAVEL'|'CELEBRATION'|'SHOPPING'|'LEISURE',
    locationLabel: string|null,
    season: 'SPRING'|'SUMMER'|'AUTUMN'|'WINTER'|null
  },
  options: PurposeOptions,
  requireKnowledgeRevision?: number,
  budget?: {maxItems?:number,maxBytes?:number}
}
```

Purpose options:

| Purpose | Exact options |
|---|---|
| MEAL_PREFERENCES | `{includeHouseholdDefaults:boolean}` |
| CLOTHING_SHOPPING | `{garment:string,system:string\|null,includeHouseholdDefaults:boolean}` |
| FAMILY_RELATIONSHIPS | `{relationshipTypes:RelationshipType[],direction:'OUTGOING'\|'INCOMING'\|'BOTH',depth?:number}` |

Clothing and relationships require a MEMBER subject. `CURRENT` requires an active
canonical member. `RETAINED_IDENTITY` permits an inactive subject but does not
reconstruct past household state. Names, aliases and `family` are not MemberIds.
Active profile accepts Family/null or an active canonical member, independently
of the requested subject. Inactive members cannot be selected as active profile.

Garment/system/location strings are bounded, trimmed exact values (160/160/100
characters). Null system matches null stored system, not every system. Null
applicability selects unscoped Memory only. Explicit applicability selects unscoped
plus structurally identical scoped Memory. There is no fuzzy/case-insensitive
matching or relevance inferred from display/source text.

Request actor IDs/roles, source lists, predicates, arbitrary Memory types, Profile
kinds, permissions, confidence ranks, evaluation dates and sensitivity overrides
are rejected. The request is copied before asynchronous access so an in-process
caller cannot modify the effective plan while I/O is pending.

## Purpose policies

| Purpose | Sources | Permitted knowledge |
|---|---|---|
| MEAL_PREFERENCES | IDENTITY, FAMILY_MEMORY | FOOD PREFERENCE, CONVENTION, DECISION, CONSTRAINT, PATTERN for the explicit subject; optional Household defaults. PATTERN must be FOOD_CHOICE/TENDENCY_ONLY. |
| CLOTHING_SHOPPING | IDENTITY, PROFILE, FAMILY_MEMORY | Exact requested garment/system CLOTHING_FIT facts; SHOPPING PREFERENCE/CONSTRAINT with exact garment topic; optional Household Memory defaults. |
| FAMILY_RELATIONSHIPS | IDENTITY, FAMILY_GRAPH | Explicit requested PARENT_OF/GUARDIAN_OF/SPOUSE_OF edges, direction and depth from one canonical member. |

No relatives are enriched with Profile/Memory. No whole roster is returned.
Sensitive fit facts are allowed only for the specific garment/system request.
Sensitive FOOD constraints are allowed for the explicit subject/default scope;
other sensitive Memory is excluded. Sensitive Graph edges must be incident to the
explicit root member; sensitive transitive edges cannot become traversal bridges.
Excluded sensitive information/counts are not reported.

The other valid AI-1D types remain supported in Memory storage but are unnecessary
for these purposes. No taxonomy/schema change is made.

## Single-read and temporal semantics

The guarded `familyKnowledgeStore.contextProjection()` validates the request and
calls the existing primary loader once. The complete envelope is validated before
any projection. Profile/Graph/Memory therefore have one revision, without API
self-calls or separately paginated reads. Canonical configuration is the existing
server-loaded identity authority, not client identity or a second registry.

One server `asOf` timestamp is captured per request. `readAt` is this evaluation
instant, not a filesystem timestamp or a claim of historical reconstruction.
Selectors include only ACTIVE records with `validFrom <= asOf < validUntil` where
those dates exist. Superseded/retracted/expired and not-yet-valid/elapsed-validity
records are omitted. Graph validity and sensitivity are filtered BEFORE the pure
existing traversal, so an excluded edge cannot bridge to another person.

Elapsed `reviewAfter` marks returned Profile/Memory STALE but does not expire it.
Missing review dates do not guarantee factual correctness. No freshness is invented
from capture time. PATTERN stays a recorded tendency, never a current/guaranteed
fact. Structured constraints retain HARD/SOFT; nothing becomes a permission.

A read concurrent with an atomic mutation can see either validated envelope;
it cannot combine Profile and Memory from different revisions. It is not a
historical or multi-file transaction. The read does not acquire a mutation lock.

`requireKnowledgeRevision` must exactly match the observed revision. Otherwise
HTTP 409/CONTEXT_REVISION_CONFLICT is returned with CONFLICTED source signals and
no substituted revision/items. Revision tokens are not globally monotonic across
offline restore. No context cache exists to invalidate after restoration.

## Response and source states

Successful JSON contains:

- version/policyVersion = 1; server-derived householdId; purpose and canonical
  subject/lifecycle; active profile personalisation; actor
  `{verification:'UNVERIFIED',actorId:null,actorRole:null}` and device null;
- asOf/timeZone, knowledgeRevision, consistency SINGLE_KNOWLEDGE_REVISION;
- completion COMPLETE or PARTIAL and the selected source results;
- effective budget, returnedItems and exact UTF-8 serializedBytes.

Each source result has `source`, `states`, `readAt`, `revision`, `completeness`,
`items` and fixed `reasons`. Identity revision is null. Knowledge sources share
knowledgeRevision. Identity items contain only the requested subject and returned
Graph endpoints: canonical IDs, display names, member lifecycle. Profile/Graph/
Memory items preserve the applicable typed semantic/validity fields, HOUSEHOLD
and sensitivity markers, and minimal provenance `{origin,recordedAt}`. Memory
also retains evidenceCount. It does not return evidence/source text, supplier ID,
display text, aliases, memberType, capture/supersession histories or configuration.

DTO unions preserve type/value correlation. Complete assertions/values are never
shortened. Profile `CLOTHING_FIT`, Graph endpoints/direction and Memory structured
assertions remain distinct authorities. No cross-source winner or confidence score
is computed. Multiple legitimate fit facts or relationships are not contradictions.
Invalid authoritative data is unavailable, not partially salvaged.

| State | Exact meaning |
|---|---|
| AVAILABLE | Successfully evaluated, eligible records existed for the request. |
| EMPTY | Successfully evaluated with no eligible records under this policy; not a claim that no other knowledge exists. |
| STALE | Returned records have elapsed reviewAfter. |
| UNAVAILABLE | Authoritative source could not be safely read/validated. |
| TRUNCATED | Eligible data exceeded a record/traversal/item/byte bound. |
| CONFLICTED | The explicit Knowledge revision precondition was not met. No semantic contradiction inference. |

A successful source starts with AVAILABLE or EMPTY, optionally followed by STALE
and TRUNCATED in that order. AVAILABLE/TRUNCATED can have zero items if a lowered
budget fits no eligible assertion. STALE is about returned records, not discarded
ones. Completeness is COMPLETE_FOR_REQUEST or BOUNDED; response completion is
PARTIAL for truncation. Sources outside policy are omitted, not marked EMPTY.

On any missing/corrupt/foreign/invalid Knowledge primary the request fails closed
with HTTP 503/CONTEXT_UNAVAILABLE, fixed UNAVAILABLE signals for selected Knowledge
sources and no context payload. It never selects `.bak` or returns valid-looking
partial Identity/Knowledge from an invalid envelope. Boundary failures preserve
AI-1B error codes/status. Strict contract failures use HTTP 400/CONTEXT_REQUEST_INVALID.
All responses use existing API no-store behavior; the route sets it explicitly.

Error body: `{success:false,code,error,sources:[{source,states}]}`. No paths, raw
provider/config data, offending values or original exception messages are returned.

## Bounds and ordering

- One primary subject; at most one explicitly requested Household default subject.
- Profile <=4; Memory <=8; Graph <=12 edges, depth default 1/max 2.
- Identity root plus endpoints of RETURNED Graph edges only.
- Total item default/max 40, caller-lowerable to 1.
- Response default/max caller budget 32,768 UTF-8 bytes, caller-lowerable to 4,096.
  A separate 65,536-byte hard ceiling is defence in depth, not a caller expansion.
- Existing 2 MiB Knowledge input and complete schema limits remain unchanged.

Stable code-unit ordering avoids locale dependence. Food hard constraints precede
soft constraints, then other allowed types/assertions, with tendencies last and
IDs as stable tie-breakers. Profile values/IDs and Graph type/IDs have fixed order.
This is budget ordering, never universal source authority ranking.

Record caps/traversal run before response budgets. If needed, whole trailing
records are removed in fixed reverse-source order. Removing a Graph edge also
prunes orphan endpoint identities. Bounds never leave a dangling Graph endpoint.
The source retains an explicit truncation reason. Serialized byte accounting
includes its own size metadata and uses the actual JSON bytes. Returned payloads
are independent copies of the read projection.

## Read-only, audit, persistence and rollback

Context code has no write/initialisation/migration/repair/fallback/reconciliation
path. It never calls Knowledge mutation methods or operational services. It adds
no revision, backup, runtime file, cache, timer, model SDK or schema migration.
The existing loader's file/path/scope/size validation is reused unchanged.

Existing AI-1B route auditing remains. Additional EYOS_CONTEXT audit logs contain
only controlled purpose (or INVALID), outcome, source classes/states and bounded
elapsed durationMs. No subject/member/household IDs, options, payloads, source or
evidence text, file paths, errors with private messages or responses are logged.
Audit sink failure cannot bypass denials or change retrieval results.

Native snapshots retain their existing ten-file inventory. Schema 1/2/3 reads are
byte-preserving. After offline restore, normal restart/reload retains the existing
runtime ownership contract; subsequent retrieval reads authoritative restored
content/revision. Rolling back this read-only feature to AI-1D requires no data
conversion or context-store cleanup.

## Mandatory office-laptop acceptance

Use a private external runtime copy and its established household-mode startup.
Do not test against production. Use the existing explicit Knowledge APIs or
validated synthetic fixtures to prepare records; do not edit canonical identities
or production data to make a case pass. Example request body:

```json
{
  "version":1,
  "purpose":"MEAL_PREFERENCES",
  "subject":{"kind":"HOUSEHOLD"},
  "subjectMode":"CURRENT",
  "activeProfile":"family",
  "applicability":null,
  "options":{"includeHouseholdDefaults":false}
}
```

Send JSON using the office API base with `POST /api/context/retrieve`. For clothing,
use a real canonical MEMBER subject and exact garment/system options. For Graph,
use MEMBER and `{relationshipTypes:['PARENT_OF'],direction:'BOTH',depth:1}` (JSON
double quotes in the actual body). No new credentials or authentication UI exists.

1. Exercise all three purposes and verify only their documented source classes.
2. Inspect output minimisation: no source/evidence/supplier/history/aliases/whole
   roster/config/provider data; exact garment/system and Memory scope matching.
3. Verify active and explicitly retained inactive subjects; reject names/unknown IDs.
4. Switch Family/member activeProfile and verify actor stays UNVERIFIED/null and
   permitted source/subject scope is unchanged.
5. Distinguish a valid empty source from a missing/corrupt primary: EMPTY versus
   503/UNAVAILABLE, with no backup fallback.
6. Verify future and elapsed validity excluded, review-due retained/STALE, and
   Graph validity excludes traversal bridges.
7. Confirm PATTERN is TENDENCY_ONLY and HARD/SOFT strengths are unchanged.
8. Lower maxItems/maxBytes; verify visible truncation, complete assertion values,
   valid JSON size accounting and no orphan Graph endpoint identities.
9. Require the current revision (success), then a different revision (409,
   CONFLICTED, no substituted context).
10. Reject Demo, foreign household assertions and invalid member/profile context.
11. Compare revision, runtime primary/backup bytes and full directory inventory
    before/after successful, failed and truncated requests; no operational changes.
12. Snapshot populated schema-v3 Knowledge, mutate via existing explicit API,
    restore offline using existing tooling and verify fresh restored retrieval.
13. Inspect EYOS_ACCESS/EYOS_CONTEXT output for approved metadata only, including
    unavailable/conflict/invalid outcomes.

## Implementation inventory

Added: context/contextContract.ts, context/contextPolicies.ts,
context/contextService.ts, knowledge/familyKnowledgeContext.ts, routes/context.ts,
three context*.test.ts suites, tests/server/helpers/context.ts and this document.
Modified: app.ts, access/memberContext.ts, knowledge/familyKnowledgeStore.ts and
householdAccessBoundary.test.ts (72 explicitly classified endpoints).

The shared fixture helper is the only addition to the suggested file inventory;
it keeps synthetic runtime/record/request setup consistent across the three test
suites. There is no operational-domain adapter or change to mealPlanStore.ts.


## Automated validation

- Focused Context suites: **82 passed**.
- Complete server regression suite: **360 passed** (including the 82 Context
  tests and existing AI-1B/1C/1D, Calendar/provider and server regressions).
- Runtime/configuration/migration/snapshot/restore suite: **148 passed**, run
  separately after server tests to avoid temporary-directory interference.
- Household frontend production build: **passed**.
- Server TypeScript build (also part of production build): **passed**.
- `git diff --check`: **passed**.

The tests use temporary external runtimes, synthetic data and local loopback HTTP.
The initial Context-only run exposed test-harness mistakes (synchronous capability
rejections passed to an async-only assertion and shared mutable request-fixture
identity). These were corrected without weakening access or isolation assertions;
all final suites above passed. No production credentials/provider requests or
repository operational data were used.
