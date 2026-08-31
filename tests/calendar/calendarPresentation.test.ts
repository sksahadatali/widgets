import assert from 'node:assert/strict';
import {
  readFileSync,
} from 'node:fs';
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
  it('renders a meaningful School source indicator', () => {
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
    assert.doesNotMatch(markup, /calendarId|provider/);
  });

  it('does not render the generic Calendar fallback indicator', () => {
    const markup = renderToStaticMarkup(
      React.createElement(CalendarSourceIndicator, {
        source: {
          id: 'calendar-example',
          label: 'Calendar',
          kind: 'calendar',
        },
      })
    );

    assert.equal(markup, '');
  });

  it('keeps the meaningful source indicator accessible', () => {
    const markup = renderToStaticMarkup(
      React.createElement(CalendarSourceIndicator, {
        source: {
          id: 'school',
          label: 'School',
          kind: 'school',
        },
      })
    );

    assert.match(markup, /aria-label="Source: School"/);
    assert.match(markup, /title="School"/);
  });

  it('keeps Demo isolated from the household endpoint', () => {
    assert.equal(shouldFetchHouseholdCalendar('demo'), false);
    assert.equal(shouldFetchHouseholdCalendar('household'), true);
  });

  it('keeps tracked Demo semantic configuration empty and synthetic', () => {
    const config = JSON.parse(
      readFileSync(
        new URL(
          '../../app/src/config/household.example.json',
          import.meta.url
        ),
        'utf8'
      )
    ) as {
      calendar: {
        endpoint: string;
        sources: unknown[];
        semanticRules: unknown[];
      };
    };

    assert.equal(config.calendar.endpoint, '');
    assert.deepEqual(config.calendar.sources, []);
    assert.deepEqual(config.calendar.semanticRules, []);
  });
});
