# Calendar API v2 Version 9: conditional event writes

Version 9 is a manual Apps Script handoff. Repository changes do not alter or deploy the live Apps Script project.

## Security contract

The existing Version 8 `doGet`, requested-window implementation, identity fields, recurrence expansion, mapping, sorting, and v1-compatible eY OS consumer behaviour remain unchanged. Version 9 adds a signed `doPost` boundary for two operations only:

- `inspect-event`: return the current v2 event and ETag.
- `update-event`: conditionally patch title, location, and same-kind timing for one ordinary event or one expanded recurring instance.

The backend sends `{ payload, signature }`. `payload` is unpadded base64url JSON and `signature` is an HMAC-SHA-256 of the payload string. The decoded object is exactly:

```json
{
  "version": 1,
  "requestId": "UUID",
  "issuedAt": "RFC3339 instant",
  "operation": "inspect-event | update-event",
  "locator": { "calendarId": "private", "providerEventId": "private" },
  "body": {}
}
```

Provider locators and ETags exist only inside this signed server-to-server exchange. Never add them to browser responses, URLs, logs, configuration projections, or profile-assignment storage.

HOME-HUB performs exactly one HTTP dispatch for each signed request; it has no automatic Apps Script retry loop. A caller-initiated retry of the read-only `inspect-event` operation constructs a new UUID, timestamp, payload and HMAC. An `update-event` revision is consumed before dispatch, so a transport failure with an ambiguous provider outcome is never retried automatically and cannot reuse the signed request or browser revision. A later edit must start with a fresh inspection and ETag. Apps Script still rejects repeated request IDs, while Google `If-Match` remains the authoritative protection against duplicate or stale mutation.

## Exact Version 8 to Version 9 replacement

Start from the supplied, deployed Version 8 `Code.gs`. Keep every Version 8 function not named below byte-for-byte. Make these named changes:

1. Change the opening comment to `eY OS Calendar API — producer contract v2, implementation Version 9`.
2. Add `WRITE_VERSION: 1`, `WRITE_MAX_AGE_MS: 300000`, and `WRITE_MAX_PAYLOAD_CHARS: 24000` to `CONFIG`.
3. Replace `determineCalendarWritability_` with the implementation below. This makes read capability metadata require both the independent allowlist and a live `owner`/`writer` role.
4. In `mapProviderEvent_`, append `&& (!providerEvent.eventType || providerEvent.eventType === 'default')` to the existing `writable` expression so birthday, focus-time, from-Gmail, out-of-office and working-location event types are read-only.
5. Add the complete `doPost` and helper block below before `buildHouseholdWindow_`.
6. Leave `doGet`, `getCalendars_`, `listCalendarEvents_`, `shouldExcludeEvent_`, all other `mapProviderEvent_` fields, all temporal/window helpers, ordering helpers, and `jsonResponse_` otherwise unchanged.

The three exact `CONFIG` additions are:

```javascript
WRITE_VERSION: 1,
WRITE_MAX_AGE_MS: 300000,
WRITE_MAX_PAYLOAD_CHARS: 24000,
```

```javascript
function editableCalendarIds_() {
  var raw = PropertiesService.getScriptProperties().getProperty('EDITABLE_CALENDAR_IDS');
  var values;
  try { values = JSON.parse(raw || ''); } catch (error) { throw new Error('Write configuration is invalid.'); }
  if (!Array.isArray(values) || values.length < 1 || values.length > 20) throw new Error('Write configuration is invalid.');
  var result = {};
  values.forEach(function (value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 300 || result[value]) throw new Error('Write configuration is invalid.');
    result[value] = true;
  });
  return result;
}

function liveWriteRole_(calendarId) {
  var entry = Calendar.CalendarList.get(calendarId);
  var role = entry && entry.accessRole;
  // Anything other than these exact roles, including reader,
  // freeBusyReader and writerWithoutPrivateAccess, fails closed.
  return role === 'owner' || role === 'writer';
}

function determineCalendarWritability_(calendarId) {
  try { return editableCalendarIds_()[calendarId] === true && liveWriteRole_(calendarId); }
  catch (error) {
    console.warn('Unable to establish calendar writability; treating as read-only.');
    return false;
  }
}

function doPost(e) {
  try {
    var request = verifiedWriteRequest_(e);
    authorizeCalendarWrite_(request.locator.calendarId);
    if (request.operation === 'inspect-event') return inspectEvent_(request);
    if (request.operation === 'update-event') return updateEvent_(request);
    throw writeError_('INVALID_REQUEST');
  } catch (error) {
    // Never log provider bodies, locators, ETags, payloads, signatures or secrets.
    var code = error && error.writeCode ? error.writeCode : 'UPSTREAM_FAILURE';
    console.warn('Calendar Version 9 write failed with code ' + code + '.');
    return jsonResponse_({ success: false, contractVersion: CONFIG.CONTRACT_VERSION, provider: CONFIG.PROVIDER, code: code });
  }
}

function writeError_(code) { var error = new Error(code); error.writeCode = code; return error; }
function exactKeys_(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  var keys = Object.keys(value).sort();
  var wanted = expected.slice().sort();
  return keys.length === wanted.length && keys.every(function (key, index) { return key === wanted[index]; });
}
function base64UrlBytes_(value) { return Utilities.base64DecodeWebSafe(value); }
function constantTimeEqual_(left, right) {
  if (left.length !== right.length) return false;
  var difference = 0;
  for (var index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}
function consumeRequestId_(requestId) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw writeError_('UPSTREAM_FAILURE');
  try {
    var cache = CacheService.getScriptCache();
    var key = 'calendar-write-v1-' + requestId;
    if (cache.get(key)) throw writeError_('INVALID_REQUEST');
    cache.put(key, 'used', 600);
  } finally { lock.releaseLock(); }
}
function verifiedWriteRequest_(e) {
  var text = e && e.postData && e.postData.contents;
  if (typeof text !== 'string' || text.length > 33000) throw writeError_('INVALID_REQUEST');
  var envelope;
  try { envelope = JSON.parse(text); } catch (error) { throw writeError_('INVALID_REQUEST'); }
  if (!exactKeys_(envelope, ['payload', 'signature']) || typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string' || envelope.payload.length > CONFIG.WRITE_MAX_PAYLOAD_CHARS || !/^[A-Za-z0-9_-]+$/.test(envelope.payload) || !/^[A-Za-z0-9_-]+$/.test(envelope.signature)) throw writeError_('INVALID_REQUEST');
  var secret = PropertiesService.getScriptProperties().getProperty('EYOS_CALENDAR_WRITE_HMAC_SECRET');
  if (!secret || secret.length < 32) throw writeError_('NOT_PERMITTED');
  var expected = Utilities.computeHmacSha256Signature(envelope.payload, secret);
  var suppliedSignature;
  try { suppliedSignature = base64UrlBytes_(envelope.signature); } catch (error) { throw writeError_('INVALID_REQUEST'); }
  if (!constantTimeEqual_(expected, suppliedSignature)) throw writeError_('NOT_PERMITTED');
  var request;
  try { request = JSON.parse(Utilities.newBlob(base64UrlBytes_(envelope.payload)).getDataAsString('UTF-8')); } catch (error) { throw writeError_('INVALID_REQUEST'); }
  if (!exactKeys_(request, ['version', 'requestId', 'issuedAt', 'operation', 'locator', 'body']) || request.version !== CONFIG.WRITE_VERSION || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.requestId) || (request.operation !== 'inspect-event' && request.operation !== 'update-event') || !exactKeys_(request.locator, ['calendarId', 'providerEventId']) || typeof request.locator.calendarId !== 'string' || !request.locator.calendarId || request.locator.calendarId.length > 300 || typeof request.locator.providerEventId !== 'string' || !request.locator.providerEventId || request.locator.providerEventId.length > 1024 || !request.body || typeof request.body !== 'object' || Array.isArray(request.body)) throw writeError_('INVALID_REQUEST');
  var issuedAt = Date.parse(request.issuedAt);
  if (!isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > CONFIG.WRITE_MAX_AGE_MS) throw writeError_('INVALID_REQUEST');
  consumeRequestId_(request.requestId);
  return request;
}
function authorizeCalendarWrite_(calendarId) {
  var allowed;
  try {
    var selectedForRead = getCalendars_().some(function (descriptor) { return descriptor.id === calendarId; });
    allowed = selectedForRead && editableCalendarIds_()[calendarId] === true && liveWriteRole_(calendarId);
  }
  catch (error) { allowed = false; }
  if (!allowed) throw writeError_('NOT_PERMITTED');
}
function writeDescriptor_(calendarId) {
  var calendar = CalendarApp.getCalendarById(calendarId);
  if (!calendar) throw writeError_('NOT_FOUND');
  return { id: calendarId, name: calendar.getName() || '', isDefault: false, writable: true };
}
function currentWritableEvent_(request) {
  var event;
  try { event = Calendar.Events.get(request.locator.calendarId, request.locator.providerEventId); }
  catch (error) { throw writeError_('NOT_FOUND'); }
  if (!event || event.status === 'cancelled' || event.locked === true || (event.eventType && event.eventType !== 'default')) throw writeError_('NOT_PERMITTED');
  return event;
}
function inspectEvent_(request) {
  if (!exactKeys_(request.body, [])) throw writeError_('INVALID_REQUEST');
  var event = currentWritableEvent_(request);
  return jsonResponse_({ success: true, contractVersion: CONFIG.CONTRACT_VERSION, provider: CONFIG.PROVIDER, event: mapProviderEvent_(event, writeDescriptor_(request.locator.calendarId)) });
}
function validCivilDate_(value) { return typeof value === 'string' && isValidCivilDate_(value); }
function londonDateTimeValid_(value) {
  if (typeof value !== 'string') return false;
  var match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return false;
  var instant = new Date(value);
  return !isNaN(instant.getTime()) && Utilities.formatDate(instant, CONFIG.HOUSEHOLD_TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss") === match[1] + 'T' + match[2];
}
function validatedPatch_(body, providerEvent) {
  if (!exactKeys_(body, ['etag', 'scope', 'title', 'location', 'timing']) || typeof body.etag !== 'string' || !body.etag || typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200 || typeof body.location !== 'string' || body.location.length > 500 || !body.timing || typeof body.timing !== 'object' || Array.isArray(body.timing)) throw writeError_('INVALID_REQUEST');
  var occurrence = Boolean(providerEvent.recurringEventId);
  if (body.scope !== (occurrence ? 'occurrence' : 'event')) throw writeError_('INVALID_REQUEST');
  var patch = { summary: body.title.trim(), location: body.location.trim() };
  var today = Utilities.formatDate(new Date(), CONFIG.HOUSEHOLD_TIME_ZONE, 'yyyy-MM-dd');
  var providerAllDay = Boolean(providerEvent.start && providerEvent.start.date && !providerEvent.start.dateTime);
  if (body.timing.kind === 'date') {
    if (!providerAllDay || !exactKeys_(body.timing, ['kind', 'startDate', 'endDateExclusive']) || !validCivilDate_(body.timing.startDate) || !validCivilDate_(body.timing.endDateExclusive) || body.timing.startDate < today || body.timing.endDateExclusive <= body.timing.startDate || (Date.parse(body.timing.endDateExclusive + 'T00:00:00Z') - Date.parse(body.timing.startDate + 'T00:00:00Z')) > 366 * 86400000) throw writeError_('INVALID_REQUEST');
    patch.start = { date: body.timing.startDate };
    patch.end = { date: body.timing.endDateExclusive };
  } else {
    if (providerAllDay || !exactKeys_(body.timing, ['kind', 'start', 'end', 'timeZone']) || body.timing.timeZone !== CONFIG.HOUSEHOLD_TIME_ZONE || !londonDateTimeValid_(body.timing.start) || !londonDateTimeValid_(body.timing.end) || new Date(body.timing.end).getTime() <= new Date(body.timing.start).getTime() || (new Date(body.timing.end).getTime() - new Date(body.timing.start).getTime()) > 366 * 86400000 || Utilities.formatDate(new Date(body.timing.start), CONFIG.HOUSEHOLD_TIME_ZONE, 'yyyy-MM-dd') < today) throw writeError_('INVALID_REQUEST');
    patch.start = { dateTime: body.timing.start, timeZone: CONFIG.HOUSEHOLD_TIME_ZONE };
    patch.end = { dateTime: body.timing.end, timeZone: CONFIG.HOUSEHOLD_TIME_ZONE };
  }
  return { etag: body.etag, resource: patch };
}
function updateEvent_(request) {
  var current = currentWritableEvent_(request);
  var patch = validatedPatch_(request.body, current);
  var url = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(request.locator.calendarId) + '/events/' + encodeURIComponent(request.locator.providerEventId) + '?sendUpdates=all';
  var response = UrlFetchApp.fetch(url, { method: 'patch', contentType: 'application/json', payload: JSON.stringify(patch.resource), headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'If-Match': patch.etag }, muteHttpExceptions: true });
  var status = response.getResponseCode();
  if (status === 412) throw writeError_('PRECONDITION_FAILED');
  if (status === 403) throw writeError_('NOT_PERMITTED');
  if (status === 404 || status === 410) throw writeError_('NOT_FOUND');
  if (status < 200 || status >= 300) throw writeError_('UPSTREAM_FAILURE');
  var updated;
  try { updated = JSON.parse(response.getContentText()); } catch (error) { throw writeError_('UPSTREAM_FAILURE'); }
  return jsonResponse_({ success: true, contractVersion: CONFIG.CONTRACT_VERSION, provider: CONFIG.PROVIDER, event: mapProviderEvent_(updated, writeDescriptor_(request.locator.calendarId)) });
}
```

`update-event` deliberately addresses the expanded occurrence ID supplied by the private registry. It never follows `recurringEventId` to a series master. `originalStartTime` remains untouched, so eY OS reconstructs the same occurrence `eventKey` after a move.

## Exact proposed `appsscript.json`

```json
{
  "timeZone": "Europe/London",
  "dependencies": {
    "enabledAdvancedServices": [
      { "userSymbol": "Calendar", "serviceId": "calendar", "version": "v3" }
    ]
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/script.external_request"
  ],
  "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }
}
```

The Advanced Calendar service remains the read/inspect client. Conditional update uses direct Calendar REST because Apps Script's Advanced service does not expose an `If-Match` request header. `UrlFetchApp` therefore requires `script.external_request`; the Calendar write scope requires reauthorization by the existing deploying identity.

## Private setup and deployment

1. Generate one cryptographically random secret of at least 32 bytes. Put the same value in Apps Script property `EYOS_CALENDAR_WRITE_HMAC_SECRET` and protected HOME-HUB `service.env` variable `EYOS_CALENDAR_WRITE_HMAC_SECRET`. Never commit or log it.
2. Set Apps Script property `EDITABLE_CALENDAR_IDS` to a JSON array containing only approved writable calendar IDs, for example `["synthetic-calendar-id-for-documentation-only"]`. This list must be a strict subset of calendars intentionally read by Version 8.
3. Add `"writeAccess": "edit-existing"` only to the matching private source objects in external `config/household.json`. Do not add it to school, subscribed, or read-only sources.
4. Enable the Calendar advanced service, replace `Code.gs` as specified, replace the manifest, save, and complete the new OAuth consent as the existing web-app deploying identity.
5. Create a test deployment first. Prove read windows, ordinary inspect/update, one recurring occurrence, all-day, BST/GMT, ETag conflict, denied reader calendar, denied non-allowlisted calendar, and safe error bodies.
6. Only after that proof, update the existing production web-app deployment to Version 9. Do not change execute-as identity or anonymous web-app reachability; the HMAC boundary is mandatory because HOME-HUB remains the only authorized caller.
7. Restart HOME-HUB after updating its protected environment and external Household configuration. A process restart intentionally clears all locator/revision memory, so reload Calendar before editing.

This handoff does not authorize creation, deletion, series editing, this-and-following, drag/drop, resize, calendar moves, attendee/description/reminder/conference changes, or profile-assignment writes at Google.
