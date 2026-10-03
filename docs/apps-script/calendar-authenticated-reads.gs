// Calendar producer Version 10 additions. See the handoff before installing.
// Rename the existing Version 9 entry points ONLY:
// doGet -> legacyCalendarGet_; doPost -> legacyCalendarWritePost_.
// Preserve their bodies and every write helper unchanged.
var READ_AUTH = {
  VERSION: 1,
  AUDIENCE: 'eyos-calendar-read-v1',
  DOMAIN: 'eyos-calendar-read-v1\n',
  MAX_AGE_MS: 60000,
  FUTURE_SKEW_MS: 15000,
  MAX_BODY_CHARS: 3000,
  MAX_PAYLOAD_CHARS: 2000,
  NONCE_PROPERTY: 'EYOS_CALENDAR_READ_NONCES_V1',
  MAX_NONCES: 64,
  MAX_LEDGER_CHARS: 6000
};

function readFailure_() {
  // ContentService may return HTTP 200: consumers must check success.
  // Do not disclose which auth check failed or echo request/provider data.
  return jsonResponse_({ success: false, code: 'CALENDAR_READ_DENIED' });
}

function doGet(e) {
  try {
    // Absent/invalid mode is final mode. Compatibility is operator-only.
    if (PropertiesService.getScriptProperties().getProperty('EYOS_CALENDAR_READ_MODE') === 'compatibility') {
      return legacyCalendarGet_(e);
    }
  } catch (error) { /* Fail closed, without logging input or secrets. */ }
  return readFailure_();
}

function doPost(e) {
  // Untrusted decoding is only a routing hint, NEVER an authorization step.
  // All other requests still pass through the unchanged Version 9 verifier.
  var readOperation = false;
  try {
    var text = e && e.postData && e.postData.contents;
    if (typeof text === 'string' && text.length <= READ_AUTH.MAX_BODY_CHARS) {
      var envelope = JSON.parse(text);
      if (envelope && typeof envelope.payload === 'string' && envelope.payload.length <= READ_AUTH.MAX_PAYLOAD_CHARS && /^[A-Za-z0-9_-]+$/.test(envelope.payload)) {
        var hint = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(envelope.payload)).getDataAsString('UTF-8'));
        readOperation = hint && hint.operation === 'read-calendar';
      }
    }
  } catch (error) { /* The write verifier rejects malformed non-read input. */ }
  if (!readOperation) return legacyCalendarWritePost_(e);
  try {
    var request = verifiedReadRequest_(e);
    var parameters = {};
    if (request.window.startDate !== undefined) parameters.startDate = [request.window.startDate];
    if (request.window.days !== undefined) parameters.days = [String(request.window.days)];
    // Only signed parameters reach the unchanged producer/window parser.
    return legacyCalendarGet_({ parameters: parameters });
  } catch (error) { return readFailure_(); }
}

function readExactKeys_(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  var keys = Object.keys(value).sort();
  var wanted = expected.slice().sort();
  return keys.length === wanted.length && keys.every(function (key, index) { return key === wanted[index]; });
}

function readEqualBytes_(left, right) {
  if (left.length !== right.length) return false;
  var difference = 0;
  for (var index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function readUuid_(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function verifiedReadRequest_(e) {
  var text = e && e.postData && e.postData.contents;
  if (typeof text !== 'string' || text.length > READ_AUTH.MAX_BODY_CHARS) throw new Error('Denied');
  var envelope = JSON.parse(text);
  if (!readExactKeys_(envelope, ['payload', 'signature']) || typeof envelope.payload !== 'string' || envelope.payload.length > READ_AUTH.MAX_PAYLOAD_CHARS || !/^[A-Za-z0-9_-]+$/.test(envelope.payload) || typeof envelope.signature !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(envelope.signature)) throw new Error('Denied');
  var properties = PropertiesService.getScriptProperties();
  var secret = properties.getProperty('EYOS_CALENDAR_READ_HMAC_SECRET');
  var writeSecret = properties.getProperty('EYOS_CALENDAR_WRITE_HMAC_SECRET');
  if (typeof secret !== 'string' || secret !== secret.trim() || secret.length < 32 || secret.length > 512 || secret === (writeSecret || '').trim()) throw new Error('Denied');
  var expected = Utilities.computeHmacSha256Signature(READ_AUTH.DOMAIN + envelope.payload, secret);
  var supplied = Utilities.base64DecodeWebSafe(envelope.signature);
  if (!readEqualBytes_(expected, supplied)) throw new Error('Denied');
  var decodedBytes = Utilities.base64DecodeWebSafe(envelope.payload);
  // Require canonical unpadded encoding rather than accepting alternate forms.
  if (Utilities.base64EncodeWebSafe(decodedBytes).replace(/=+$/, '') !== envelope.payload) throw new Error('Denied');
  var request = JSON.parse(Utilities.newBlob(decodedBytes).getDataAsString('UTF-8'));
  if (!readExactKeys_(request, ['version', 'audience', 'operation', 'requestId', 'issuedAt', 'window']) || request.version !== READ_AUTH.VERSION || request.audience !== READ_AUTH.AUDIENCE || request.operation !== 'read-calendar' || !readUuid_(request.requestId) || typeof request.issuedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(request.issuedAt)) throw new Error('Denied');
  var issuedAt = Date.parse(request.issuedAt);
  var now = Date.now();
  if (!isFinite(issuedAt) || new Date(issuedAt).toISOString() !== request.issuedAt || now - issuedAt > READ_AUTH.MAX_AGE_MS || issuedAt - now > READ_AUTH.FUTURE_SKEW_MS) throw new Error('Denied');
  var window = request.window;
  var keys = window && typeof window === 'object' && !Array.isArray(window) ? Object.keys(window) : null;
  if (!keys || keys.some(function (key) { return key !== 'startDate' && key !== 'days'; }) || (window.days !== undefined && window.startDate === undefined)) throw new Error('Denied');
  if (window.startDate !== undefined && (typeof window.startDate !== 'string' || !isValidCivilDate_(window.startDate))) throw new Error('Denied');
  if (window.days !== undefined && (!Number.isSafeInteger(window.days) || window.days < 1 || window.days > 42)) throw new Error('Denied');
  // Use the existing parser to retain household-today/past-window validation.
  var parameters = {};
  if (window.startDate !== undefined) parameters.startDate = [window.startDate];
  if (window.days !== undefined) parameters.days = [String(window.days)];
  requestedWindow_({ parameters: parameters });
  reserveReadNonce_(request.requestId.toLowerCase(), issuedAt + READ_AUTH.MAX_AGE_MS);
  return request;
}

function reserveReadNonce_(requestId, expiresAt) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Denied');
  try {
    // Lock contention must not admit a request that expired while waiting.
    var now = Date.now();
    if (expiresAt < now || expiresAt - READ_AUTH.MAX_AGE_MS - now > READ_AUTH.FUTURE_SKEW_MS) throw new Error('Denied');
    var properties = PropertiesService.getScriptProperties();
    var raw = properties.getProperty(READ_AUTH.NONCE_PROPERTY);
    if (raw !== null && (typeof raw !== 'string' || raw.length > READ_AUTH.MAX_LEDGER_CHARS)) throw new Error('Denied');
    var ledger = raw === null ? { version: 1, nonces: {} } : JSON.parse(raw);
    if (!readExactKeys_(ledger, ['version', 'nonces']) || ledger.version !== 1 || !ledger.nonces || typeof ledger.nonces !== 'object' || Array.isArray(ledger.nonces)) throw new Error('Denied');
    var keys = Object.keys(ledger.nonces);
    if (keys.length > READ_AUTH.MAX_NONCES) throw new Error('Denied');
    keys.forEach(function (key) {
      var expiry = ledger.nonces[key];
      if (!readUuid_(key) || key !== key.toLowerCase() || !Number.isSafeInteger(expiry)) throw new Error('Denied');
      // Equality is still valid; never delete a nonce before it is unusable.
      if (expiry < now) delete ledger.nonces[key];
    });
    if (Object.prototype.hasOwnProperty.call(ledger.nonces, requestId) || Object.keys(ledger.nonces).length >= READ_AUTH.MAX_NONCES) throw new Error('Denied');
    ledger.nonces[requestId] = expiresAt;
    var serialized = JSON.stringify(ledger);
    if (serialized.length > READ_AUTH.MAX_LEDGER_CHARS) throw new Error('Denied');
    properties.setProperty(READ_AUTH.NONCE_PROPERTY, serialized);
    // A failed write/readback must never permit a Calendar fetch.
    if (properties.getProperty(READ_AUTH.NONCE_PROPERTY) !== serialized) throw new Error('Denied');
  } finally { lock.releaseLock(); }
}
