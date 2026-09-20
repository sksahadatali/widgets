# Calendar API v2 Version 8 handoff

Phase 3 adds one bounded multi-week read contract for Month View:

```text
?startDate=YYYY-MM-DD&days=N
```

`days` is an integer from 1 through 42. Calendar API v2 Version 7 already
supports `startDate` for seven days. Version 8 must add only the bounded day
count; it must not change calendar selection, pagination, event mapping,
identity, sorting, write permissions, deployment identity, or access.

## Required Code.gs change

In `doGet(e)`, replace the Version 7 window setup:

```javascript
var startDate = requestedWindowStart_(e);
var endDateExclusive = addCivilDays_(startDate, CONFIG.DAYS_TO_FETCH);
```

with:

```javascript
var requestedWindow = requestedWindow_(e);
var startDate = requestedWindow.startDate;
var days = requestedWindow.days;
var endDateExclusive = addCivilDays_(startDate, days);
```

Replace `requestedWindowStart_` with the following parser. Keep the existing
`isValidCivilDate_` and `addCivilDays_` helpers unchanged.

```javascript
function requestedWindow_(e) {
  var parameters = e && e.parameters ? e.parameters : {};
  var keys = Object.keys(parameters);
  var allowed = { startDate: true, days: true };

  if (keys.some(function (key) { return !allowed[key]; })) {
    throw new Error('Calendar window is invalid.');
  }

  var today = Utilities.formatDate(
    new Date(),
    CONFIG.HOUSEHOLD_TIME_ZONE,
    'yyyy-MM-dd'
  );
  var startValues = parameters.startDate;
  var dayValues = parameters.days;

  if (startValues === undefined && dayValues === undefined) {
    return {
      startDate: today,
      days: CONFIG.DAYS_TO_FETCH
    };
  }

  if (!Array.isArray(startValues) || startValues.length !== 1) {
    throw new Error('Calendar window is invalid.');
  }

  var startDate = String(startValues[0]);
  if (!isValidCivilDate_(startDate) || startDate < today) {
    throw new Error('Calendar window is invalid.');
  }

  if (dayValues === undefined) {
    return {
      startDate: startDate,
      days: CONFIG.DAYS_TO_FETCH
    };
  }

  if (!Array.isArray(dayValues) || dayValues.length !== 1) {
    throw new Error('Calendar window is invalid.');
  }

  var dayText = String(dayValues[0]);
  if (!/^[1-9]\d*$/.test(dayText)) {
    throw new Error('Calendar window is invalid.');
  }

  var days = Number(dayText);
  if (!Number.isSafeInteger(days) || days > 42) {
    throw new Error('Calendar window is invalid.');
  }

  return {
    startDate: startDate,
    days: days
  };
}
```

Continue parsing `startDate` and `endDateExclusive` independently as
`Europe/London` civil midnights. Never calculate the end instant using
`days * 24` elapsed hours: a requested range spanning a DST transition can
contain 23-hour or 25-hour civil days.

The v2 response must report the actual requested interval exactly as before:

```javascript
window: {
  startDate: startDate,
  endDateExclusive: endDateExclusive,
  timeMin: timeMin.toISOString(),
  timeMax: timeMax.toISOString()
}
```

Keep all existing Version 7 behaviour unchanged:

- default calendar plus configured named calendars, deduplicated by stable ID;
- Advanced Calendar API pagination with `singleEvents: true`, global sorting,
  existing global event cap, and declined/deleted filtering;
- `providerEventId`, stable `calendarId`, `recurringEventId`, immutable
  `originalStartTime`, `iCalUID`, `etag`, status, and writability;
- no provider writes;
- no raw provider credentials or locators added to the eY OS browser contract.

## Version 8 deployment checks

Deploy a new version of the existing Apps Script web app. Do not create a new
deployment or change who executes it or who can access it.

Verify these producer responses before office-laptop acceptance:

1. No parameters still returns exactly seven civil days from Household Today.
2. `?startDate=2026-09-27` still returns `2026-09-27` through
   `2026-10-04` exclusive.
3. `?startDate=2026-09-27&days=35` returns `2026-09-27` through
   `2026-11-01` exclusive in one response.
4. Repeated, malformed, zero, negative, fractional, or greater-than-42 `days`
   values fail; `days` without `startDate` fails.
5. A request before Household Today fails.

The eY OS backend verifies the returned civil interval and fails closed until
Version 8 is deployed. Automated repository tests use a mock producer and do
not assume that deployment has happened.
