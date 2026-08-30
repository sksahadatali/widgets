import assert from 'node:assert/strict';
import {
  describe,
  it,
} from 'node:test';

import React from 'react';
import {
  renderToStaticMarkup,
} from 'react-dom/server';

import {
  shouldFetchHouseholdCalendar,
} from '../../app/src/calendar/calendarMode.ts';
import {
  CalendarSourceIndicator,
} from '../../app/src/components/modules/Calendar/CalendarSourceIndicator.tsx';

describe('Calendar presentation boundaries', () => {
  it('renders a safe source indicator without provider identity', () => {
    const markup = renderToStaticMarkup(
      React.createElement(CalendarSourceIndicator, {
        source: {
          id: 'school',
          label: 'School',
          kind: 'school',
        },
      })
    );

    assert.match(markup, />School<\/span>/);
    assert.match(markup, /aria-label="Source: School"/);
    assert.doesNotMatch(markup, /calendarId|provider/);
  });

  it('keeps Demo isolated from the household endpoint', () => {
    assert.equal(shouldFetchHouseholdCalendar('demo'), false);
    assert.equal(shouldFetchHouseholdCalendar('household'), true);
  });
});
