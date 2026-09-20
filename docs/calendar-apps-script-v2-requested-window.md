# Calendar API v2 requested-window producer change

The Calendar page now calls the private eY OS backend with one civil-date
parameter:

```text
GET /api/calendar?startDate=YYYY-MM-DD
```

The backend forwards only that validated value to the configured Apps Script
web app. The deployed Calendar API v2 producer must therefore use the requested
date as the start of its existing seven-civil-day window. Its no-parameter
behaviour remains Household Today through Today + 6, which preserves the Home
compact Calendar and v1 callers.

## Required producer edit

Change the entry point from `doGet()` to `doGet(e)`. Where it currently derives
`startDate` directly from Household Today, use:

```javascript
var startDate = requestedWindowStart_(e);
var endDateExclusive = addCivilDays_(startDate, CONFIG.DAYS_TO_FETCH);
```

Keep `CONFIG.DAYS_TO_FETCH` at `7`. Continue converting `startDate` and
`endDateExclusive` independently to `Europe/London` civil midnights before
serialising `timeMin` and `timeMax`. Do not calculate `timeMax` by adding
`7 * 24` elapsed hours.

Add these helpers alongside the producer's existing civil-date helpers:

```javascript
function requestedWindowStart_(e) {
  var today = Utilities.formatDate(
    new Date(),
    CONFIG.HOUSEHOLD_TIME_ZONE,
    'yyyy-MM-dd'
  );
  var values = e && e.parameters
    ? e.parameters.startDate
    : undefined;

  if (values === undefined) {
    return today;
  }

  if (!Array.isArray(values) || values.length !== 1) {
    throw new Error('Calendar window is invalid.');
  }

  var startDate = String(values[0]);
  if (!isValidCivilDate_(startDate) || startDate < today) {
    throw new Error('Calendar window is invalid.');
  }

  return startDate;
}

function isValidCivilDate_(value) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match || Number(match[1]) < 1000) {
    return false;
  }

  var date = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  ));

  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd') === value;
}
```

The existing v2 response must continue to report the actual fetched interval:

```javascript
window: {
  startDate: startDate,
  endDateExclusive: endDateExclusive,
  timeMin: timeMin.toISOString(),
  timeMax: timeMax.toISOString()
}
```

No event identity mapping changes are required. Keep `providerEventId`, stable
`calendarId`, `recurringEventId`, and immutable `originalStartTime` exactly as
they are so the backend-generated `eventKey` and saved profile assignments stay
stable across window requests.

## Deployment and acceptance

Deploy this producer edit as a new version of the existing Apps Script web app,
without changing its execution identity or access boundary. Before office
acceptance, request both the default endpoint and
`?startDate=2026-09-27`; confirm that the second v2 response reports
`window.startDate` as `2026-09-27` and `window.endDateExclusive` as
`2026-10-04`.
