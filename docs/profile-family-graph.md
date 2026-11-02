# AI-1C — Profile & Family Graph

Baseline: `03b700bd2309b8a0b147e3c95deb838aa21f5bb5`.

This phase adds explicit descriptive Profile facts and three explicit family
relationships. It contains no AI, Memory, Context Retrieval, permissions or new
management UI. Operational domains remain authoritative and are not copied here.

## Identity and access

`config/household.json` remains the sole canonical identity authority. A Profile
references `{kind:"HOUSEHOLD"}` or `{kind:"MEMBER", memberId}`; it never stores a
second member identity, display name, aliases, memberType or member lifecycle.
There is at most one Profile per canonical subject. Inactive members remain valid
historical subjects and endpoints. Unknown IDs, names, aliases and `family` are
rejected. Renames, classification and lifecycle changes do not rewrite knowledge.

All live calls require AI-1B's server-issued capability before constructing a store
or reading files. The eight new HTTP routes are HOUSEHOLD-classified, bringing the
API inventory to 65. Demo cannot reach them. Supplied member references are checked
at defined input positions before handler access; provenance suppliers, if stated,
must be active members. A supplier is unverified attribution, not authenticated
actor identity. Subjects/endpoints may be inactive for explicit historical capture.
Profile selection and relationships never grant permissions.

## Physical format and compatibility

The same `data/family-knowledge.local.json` has two supported versions:

- Schema 1: the unchanged AI-1A empty envelope, revision 0 and three empty arrays.
- Schema 2: the same six top-level fields; a nonnegative safe integer revision,
  typed `profiles`, typed `relationships`, and **empty/unsupported `memories`**.

Schema-1 reads normalize only in memory and do not write. The first successful
explicit mutation publishes schema 2 at revision 1. Invalid legacy nonempty data
is still rejected. `emptyFamilyKnowledge()` and the AI-1A migration continue to
produce exactly the original schema-1 empty envelope. No runtime layout/config
migration or new datastore is introduced. Runtime layout stays 3; household config
stays 2. Old snapshots remain immutable/verifiable. Populated new snapshots retain
the existing ten-file inventory, checksum, lock and transactional restore rules.

Full runtime/snapshot scope validation now also resolves every knowledge subject,
relationship endpoint and provenance supplier against that payload's canonical
registry, including inactive members. Household-ID mismatch still fails closed.
No identity is repaired or remapped. Old application releases cannot read a
populated schema-2 envelope: rollback requires the separately verified compatible
pre-change runtime/snapshot, not running an older release over new data.

## Exact Profile shape

```ts
type Subject = {kind:'HOUSEHOLD'} | {kind:'MEMBER'; memberId:string};
type Profile = {
  id: string; // server-generated UUID v4, entity ID, not a person identity
  subject: Subject;
  createdAt: string; updatedAt: string; // canonical UTC ISO capture metadata
  facts: Fact[];
};
type Provenance = {
  origin: 'EXPLICIT' | 'CONFIRMED';
  suppliedByMemberId: string | null;
  sourceStatement: string | null; // supporting statement, max 300 chars
  recordedAt: string; // server capture timestamp, equal to record createdAt
};
type Fact = {
  id:string;
  kind: FactKind; value: TypedValue; // discriminated pairing below
  audience:'HOUSEHOLD'; sensitivity:'STANDARD'|'SENSITIVE';
  lifecycle:'ACTIVE'|'SUPERSEDED'|'RETRACTED';
  validFrom:string|null; validUntil:string|null; reviewAfter:string|null;
  createdAt:string; updatedAt:string; endedAt:string|null;
  supersedes:string|null; supersededBy:string|null;
  provenance:Provenance;
};
```

| Fact kind | Exact value fields |
|---|---|
| LANGUAGE | `{code:string}` — lowercase 2–3 letter language prefix, optional subtags |
| CITIZENSHIP | `{countryCode:string}` — uppercase two-letter format |
| BIRTH_CONTEXT | `{date:string|null, place:string|null}` — real civil date format; at least one supplied |
| RELIGIOUS_IDENTITY | `{tradition:string}` |
| ACTIVITY_PARTICIPATION | `{activity:string, organization:string|null}` |
| MEMBERSHIP | `{organization:string, membershipType:string|null}` |
| CHILDCARE_ASSOCIATION | `{organization:string}` |
| CLOTHING_FIT | `{garment:string, size:string, system:string|null}` |

These are format/shape checks, not external verification of a person's claims or a
complete external country/language registry. Value strings are trimmed, bounded
to 160 characters, and reject control characters. Unknown fields/kinds are rejected;
there is no generic FACT/NOTE or unrestricted dictionary field. Human-readable
values describe the typed fact; `sourceStatement` is supporting provenance, not a
free-form knowledge/memory record. Preferences, schedules, identity and permissions
are not accepted schema fields.

Fact input supplies kind/value/audience/sensitivity/validity/review/provenance.
Record IDs and capture timestamps are exclusively server-generated. Validity and
review timestamps must be canonical UTC ISO or null; unknown historical dates stay
null. A dated birth context is explicit input, never derived from memberType.
`reviewAfter` does not expire records. No lifecycle or fact inference runs.

Duplicate active kind/value assertions are rejected using stable object-key
comparison. Distinct values may coexist (for example several languages or
citizenships); the service never silently chooses a truth from them. Explicit
same-kind supersession creates a new record and links both records reciprocally;
cycles/dangling links are invalid. Retraction retains the record and original
provenance. There is no destructive Profile/fact deletion or general patch API.

## Exact Graph shape

```ts
type Relationship = {
  id:string; type:'PARENT_OF'|'GUARDIAN_OF'|'SPOUSE_OF';
  fromMemberId:string; toMemberId:string;
  audience:'HOUSEHOLD'; sensitivity:'STANDARD'|'SENSITIVE';
  lifecycle:'ACTIVE'|'RETRACTED';
  validFrom:string|null; validUntil:string|null;
  createdAt:string; updatedAt:string; endedAt:string|null;
  provenance:Provenance;
};
```

Only explicit assertions are persisted. Self edges and unknown endpoints/types are
invalid. An active directed type/endpoint duplicate is invalid; SPOUSE_OF duplicates
are detected in either endpoint order and spouse traversal is symmetric. Explicit
active PARENT_OF cycles are rejected. Different relationship types do not imply
one another; no monogamy, age, gender, role or permission rule is invented.
Retraction preserves original capture provenance and endpoints. Reassertion after
retraction creates another record with its own explicit capture provenance.

`MEMBER_OF_HOUSEHOLD` is derived only from canonical identity. It is rejected from
persisted relationships and query relationship types.

Graph query is a pure bounded projection of explicit records:

```ts
{
  memberId:string,
  relationshipTypes:('PARENT_OF'|'GUARDIAN_OF'|'SPOUSE_OF')[],
  direction:'OUTGOING'|'INCOMING'|'BOTH',
  depth:number, // 1..3
  limit:number, // 1..100 returned relationships
  includeRetracted:boolean
}
```

At most 100 members are visited. Results return revision, explicit relationships,
derived membership for visited members, and `truncated` when a traversal/result
budget cuts off further matching edges. Lifecycle filtering is explicit; validity
metadata is returned unchanged, not interpreted as inferred current family state
or reconstructed historical truth. There is no semantic/context retrieval service.

## Mutations, durability and revision

Every mutation requires exact `expectedRevision`. Mutations are serialized per
runtime file, reread/validate the authoritative primary, clone in memory, validate
the complete candidate against canonical config, and increment revision once.
Stale/concurrent expectations return 409; no-op/repeated lifecycle operations are
rejected rather than bumping revision. All validation/access/revision rejections
leave the primary and backup unchanged. No read initializes, migrates or repairs.

Publication uses exclusively created 0600 temporary files, file fsync, a flushed
previous-primary `.bak`, atomic rename and directory fsync using the existing
Windows-aware durability helper. Failed pre-publication writes retain the primary;
staging files are cleaned. Backups are evidence, never automatic fallback.
Corrupt/missing/foreign primaries fail closed. A directory-flush failure after
publication has an inherently uncertain commit outcome and reports
`FAMILY_KNOWLEDGE_COMMIT_UNCERTAIN` (503): reread revision before retrying rather
than assuming the old write failed. Expected-revision checks prevent blind duplicate
writes. Offline snapshot/restore retains its existing ownership/lock contract.

Limits: 100 Profiles (also constrained by canonical registry uniqueness), 100 facts
including history per Profile, 1,000 relationships including history, 2 MiB primary.
Reaching a limit rejects additional data without automatic pruning. This phase
adds no retention/deletion policy. Restoring a snapshot restores its recorded
revision and content; restart/reload clients after offline restore. Revision is a
CAS token within the current runtime history, not a global clock across restores.

## API and acceptance

| Method | `/api/family-knowledge` suffix | Body/query |
|---|---|---|
| GET | `/profiles` | optional `memberId`; omitted means Household; includes retained facts |
| POST | `/profiles` | `{expectedRevision, subject}` |
| POST | `/profiles/:profileId/facts` | `{expectedRevision, fact}` |
| POST | `/profiles/:profileId/facts/:factId/supersede` | `{expectedRevision, fact}` |
| POST | `/profiles/:profileId/facts/:factId/retract` | `{expectedRevision}` |
| POST | `/relationships` | `{expectedRevision, relationship}` |
| POST | `/relationships/:relationshipId/retract` | `{expectedRevision}` |
| POST | `/graph/query` | bounded query above; no mutation |

Provenance input omits `recordedAt` (server-generated). Mutation responses return
`{revision,result}`. Reads return `{revision,profile}` or Graph projection. Errors
are generic fixed codes; no raw payload, path or member registry is logged.
Existing AI-1B assertion/error/audit behaviour is retained. The existing route
inventory assertion is updated from 57 to 65 because eight explicitly classified
routes were added; no old boundary assertion was weakened.

On a private office v3 runtime copy: verify legacy reads are byte-preserving;
create one Household and Member Profile; add/supersede/retract an explicit fact;
add/retract/query a relationship; verify stale revision, duplicate, unknown member,
foreign household and Demo rejection. Check inactive historical resolution and
that names/memberType changes do not change subjects or imply relationships.
Verify a populated snapshot/restore and pre-change snapshot verification. Keep a
compatible pre-change backup for application rollback. Do not use production for
these checks. No UI or external provider setup is required.

## Automated validation

- Full server suite (`NODE_PATH=./node_modules:../app/node_modules node --import tsx --test --test-concurrency=1 ../tests/server/*.test.ts` from `server`): **244 passed**, including **30 new AI-1C tests** and the existing AI-1B/Calendar/provider/deployment tests.
- `npm run test:runtime --prefix server`: **148 passed**, including AI-1A canonical identity, migration, snapshot/restore and durability regressions.
- Operational domains (same serial server runner, `../tests/routines/*.test.ts ../tests/rewards/*.test.ts ../tests/lists/*.test.ts ../tests/meals/*.test.ts ../tests/kumon/*.test.ts`): **211 passed**.
- Calendar (same runner with `TSX_TSCONFIG_PATH=../tests/calendar/tsconfig.json`, `../tests/calendar/*.test.ts`): **96 passed**.
- Focused client compatibility (same runner with `TSX_TSCONFIG_PATH=../tests/client/tsconfig.json`, six client config/profile/Calendar suites): **30 passed**.
- `VITE_EY_MODE=household npm run build:production`: **passed**, frontend production and server TypeScript.
- Standalone server TypeScript build: **passed**.
- `git diff --check`: **passed**.

No lint/typecheck script exists for the server beyond TypeScript build. Frontend
source was unchanged; its TypeScript validation is part of the production build.
All test mutations used temporary runtimes. Repository `server/data/`, production
configuration, credentials and external providers were not modified.

Ordinary write failures clean owned temporary files. If the process is killed,
retain leftover staging files as recovery evidence and use the existing offline
runtime/snapshot recovery procedure; do not promote a temporary/backup file by
assumption or edit identity to force validation. There is no automatic data repair.
