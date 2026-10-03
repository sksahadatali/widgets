# Calendar producer Version 10: authenticated reads

This is a manual handoff, not a deployment. No HOME-HUB or Google configuration
is changed by checking out/building this branch. Do not add new personal sources
until final-mode acceptance succeeds. Preserve Version 9 write security.

## Contract

The browser still uses GET `/api/calendar` with the existing window parameters.
Only the server-to-Apps-Script read transport changes to POST JSON. The backend
uses the existing private `calendar.endpoint`, follows ContentService redirects,
and retains the 15-second deadline, abort, Server-Timing, normalization, opaque
identities, profile assignments, in-flight coordination and frontend SWR.

Envelope: exactly `{payload, signature}`. Both strings use unpadded base64url.
`payload` is UTF-8 JSON with exactly:

```json
{
  "version": 1,
  "audience": "eyos-calendar-read-v1",
  "operation": "read-calendar",
  "requestId": "11111111-1111-4111-8111-111111111111",
  "issuedAt": "2026-10-03T12:00:00.000Z",
  "window": {}
}
```

The UUID and timestamp above are synthetic examples, never reusable requests.
Window `{}` retains household-today/default-seven-day semantics. Explicit windows
are `{startDate: "YYYY-MM-DD"}` or `{startDate: "YYYY-MM-DD", days: N}`; N is an
integer 1–42. The existing Version 8 parser still rejects past/invalid windows
and preserves household civil dates/DST. Query parameters on the provider URL
cannot override the signed body; the read handler passes only signed parameters
to the existing parser. No signature/credential is placed in a URL.

Signature calculation, identically on Node and Apps Script:

```text
base64url_without_padding(
  HMAC_SHA256(read_key, UTF8("eyos-calendar-read-v1\n" + payload))
)
```

The `\n` above is a single LF byte. Sign the encoded payload exactly; do not
decode/re-serialize before verifying. The read key must be independent of the
write key; equal keys fail closed. The existing write signing format is unchanged.
Keys are trimmed server-side; configure the Apps Script value without whitespace.
Each key must have 32–512 characters. Generate at least 32 random bytes, encoded
as a printable high-entropy string; length checks do not establish entropy.

## Producer installation (controlled test deployment first)

1. Start with the established Version 9 producer. Keep source selection,
   `CALENDAR_NAMES`, Google permissions, event mapping/expansion, all write
   authorization helpers and manifest scopes unchanged.
2. Rename the existing `function doGet(e)` to `function legacyCalendarGet_(e)`.
   Preserve its body. This is the complete existing read/aggregation path.
3. Rename existing `function doPost(e)` to
   `function legacyCalendarWritePost_(e)`. Preserve its body and all helpers.
4. Add **exactly** the companion
   [calendar-authenticated-reads.gs](apps-script/calendar-authenticated-reads.gs)
   as a script file. It supplies the new `doGet`/`doPost` entry points. The complete
   deployed producer is not tracked here; these additions depend on existing
   `jsonResponse_`, `isValidCivilDate_` and Version 8 `requestedWindow_` helpers.
5. Keep Execute as the existing deploying identity and the established anonymous
   deployment access setting. Application authentication now controls reads;
   changing Google's login gate would also block the current server/write client.

Dispatch inspects a bounded, untrusted body only to choose a verifier. A routing
hint never grants authority. `read-calendar` uses the independent read verifier;
all other requests use the unchanged Version 9 write entry point. Read verification
precedes Calendar API calls. Unknown fields, malformed encoding, bad signatures,
wrong audience/version/operation, bad windows and replay failures are denied.

Missing/invalid read configuration returns only
`{success:false,code:"CALENDAR_READ_DENIED"}`. No input, secrets, signatures,
locators, provider bodies or redirect URLs may be logged/echoed. ContentService
may return HTTP 200 for this envelope; the backend's existing `success === true`
and Calendar contract checks reject it. There is never unsigned-read fallback.

## Freshness and durable replay protection

Issued-at is exact UTC ISO format with milliseconds. Requests may be at most
60,000 ms old and at most 15,000 ms in the future, inclusive. Clocks must be kept
accurate. Each provider attempt generates a new UUID and signature; an already
consumed envelope cannot be retried, even if its Calendar fetch failed.

The Script Property `EYOS_CALENDAR_READ_NONCES_V1` is producer-owned. It holds a
versioned JSON map of normalized UUIDs to their `issuedAt + 60000` expiry instant.
It contains no Calendar data or secrets. The script reserves each nonce atomically
under the script lock, verifies storage, then releases the lock **before** fetching
Google. Cleanup removes only entries with expiry strictly before current time;
thus future-skew requests remain reserved for their whole possible 75-second
validity interval, and equality at expiry does not open a replay gap.

Limits: 64 live nonces, 6,000 serialized characters, 1-second lock acquisition.
This fits one Script Property below the per-value storage limit, avoids an
unbounded property scan, and accommodates normal deduplicated household traffic.
Full/corrupt storage, quota exhaustion, failed storage verification, or unavailable
locks deny access. Cleanup happens on authenticated requests; no trigger or new
response cache is introduced. Capacity exhaustion can temporarily deny valid
traffic until entries expire. Script Properties quotas remain applicable.

Do not replace this ledger with CacheService, whose entries can disappear early.
Do not manually clear live nonces: clearing them reopens replay eligibility.
For corrupt-state recovery, stop signed callers, rotate the read key, wait at
least 75 seconds since the last old-key request, then remove only this ledger
property and resume with the new matching read key. Never clear the write ledger
or change write authentication as part of read recovery. Administrative/script
editor access is trusted; this protocol cannot protect against privileged tampering.

## Private configuration and GET modes

Configure independent `EYOS_CALENDAR_READ_HMAC_SECRET` values in protected
HOME-HUB `service.env` and Apps Script Script Properties. Development uses
server-only environment configuration. Examples contain placeholders only.
Do not put keys in household JSON, Vite, Git, shell command lines, URLs or logs.
No source mapping/schema changes, OAuth scope additions or endpoint changes are
required. HOME-HUB must restart after an approved environment change.

Apps Script property `EYOS_CALENDAR_READ_MODE`:

| Value | Unsigned GET behaviour |
| --- | --- |
| `compatibility` | Explicitly permits the existing GET feed during brief cutover |
| `final`, absent, or any other value | Returns denial with no Calendar API read/event data |

Signed POST reads require authentication in **both** modes. Compatibility does not
allow bad POSTs to become GETs. No backend compatibility switch/fallback exists.

## Production migration — instructions only, do not execute from this branch

1. Privately create/configure a separate test read key on the controlled test
   Apps Script deployment and test backend. Use a genuinely server-callable test
   deployment: the editor-only `/dev` URL is not equivalent to production access.
2. Install the producer additions there. Prove default/seven-day/month signed reads,
   denied missing/bad/expired/replayed requests and final-mode unsigned denial.
3. Prove existing Version 9 writes work with the unchanged write key/allowlist,
   provider permissions, ETags and recurring occurrence-only semantics.
4. Privately configure a separate production read key on Apps Script and HOME-HUB.
   Keep the production write key and all source mappings unchanged.
5. Update the **existing** production Apps Script deployment to Version 10, with
   explicit `compatibility` mode briefly enabled. Do not add personal sources.
6. Release the signed-read-capable eY OS backend and restart HOME-HUB using the
   established release procedure. No frontend/API contract change is required.
7. Force genuine current/week/month provider reads; warm browser cache alone is
   not acceptance. Confirm authenticated requests and normal timing/error handling.
8. Set Apps Script read mode to `final`. The property is checked per request;
   confirm the current deployed code is Version 10.
9. Prove unsigned GET returns no events and performs no Calendar read; prove valid
   HOME-HUB signed reads still succeed, then verify existing Calendar editing.
10. Inventory other active deployments/old URLs and retire or secure any legacy
    anonymous feed. Securing one deployment does not secure older deployments.

Keep compatibility brief: it retains the previous exposure until final mode.
Only integrate another personal calendar after every closure/acceptance check.

## Rollback and acceptance

Before final-mode closure, the old backend remains compatible with the temporary
GET mode; any such rollback must be explicit and time-bounded. After closure,
rollback to a known-good **signed-read-compatible backend/producer pair**.
Do not restore anonymous reads as normal recovery. Never auto-fallback on auth
failure. Existing frontend SWR retains last-successful data after refresh failure;
genuine cold loads fail safely. Stale presentation does not grant edit authority.

Manual acceptance must cover cold load/manual refresh/week/month, Home consumer
deduplication, warm navigation and Ambient Calendar prefetch; denied unsigned and
invalid signed requests; ordinary/recurring editing and ETag conflicts; read-only
sources; persistent assignments; privacy of browser config/responses/logs; and
signed-compatible rollback. Confirm an active old deployment cannot return events.

Executable tests load the exact companion script, Version 8 window parser and
Version 9 write verifier. They cover nonce contention/storage failure and secure
dispatch; they do not establish live Google deployment configuration, quota
availability, redirects or sharing permissions. Anonymous invocation can still
consume Apps Script execution quota: HMAC is not network-level denial-of-service
protection. Secret holders can impersonate HOME-HUB; protect runtime files and
script-editor access. Existing eY OS/Cloudflare Access boundaries remain necessary.
