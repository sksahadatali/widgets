import assert from 'node:assert/strict';
import {
  describe,
  it,
} from 'node:test';

import {
  classifyCalendarEvent,
  isValidCalendarSemanticRule,
  type CalendarSemanticRule,
} from '../../app/src/calendar/calendarSemantics.ts';

import type {
  CalendarEvent,
} from '../../app/src/calendar/calendarModel.ts';

import {
  validateHouseholdConfig,
  type HouseholdConfig,
} from '../../app/src/services/householdConfigService.ts';

function event(
  title: string,
  description = '',
  sourceKind = 'school'
): CalendarEvent {
  return {
    id: 'event-1',
    title,
    start: '2026-09-01',
    end: '2026-09-02',
    startLocalDate: '2026-09-01',
    endLocalDateExclusive: '2026-09-02',
    allDay: true,
    location: '',
    description,
    calendarUrl: 'https://example.invalid/calendar',
    source: {
      id: 'school',
      label: 'School',
      kind: sourceKind,
    },
  };
}

const RULES: CalendarSemanticRule[] = [
  {
    sourceId: 'school',
    titleEquals: 'Training Day',
    kind: 'school.training-day',
    label: 'Configured training',
  },
  {
    sourceId: 'school',
    titleIncludes: 'half-term',
    kind: 'school.holiday',
    label: 'Half-term',
  },
];

describe('Calendar School semantic classification', () => {
  for (const kind of [
    'school.training-day',
    'school.holiday',
    'school.reopens',
  ] as const) {
    it(`classifies the supported ${kind} marker`, () => {
      assert.deepEqual(
        classifyCalendarEvent(
          event('Academic event', `eyos.kind=${kind}`),
          []
        ),
        { kind }
      );
    });
  }

  it('accepts a validated optional marker label', () => {
    assert.deepEqual(
      classifyCalendarEvent(
        event(
          'Academic event',
          'Notes\neyos.kind=school.holiday\neyos.label= Autumn half-term '
        ),
        []
      ),
      {
        kind: 'school.holiday',
        label: 'Autumn half-term',
      }
    );
  });

  it('fails closed for malformed marker syntax', () => {
    assert.equal(
      classifyCalendarEvent(
        event('Training Day', 'eyos.kind = school.holiday'),
        RULES
      ),
      null
    );
  });

  it('fails closed for an unsupported marker', () => {
    assert.equal(
      classifyCalendarEvent(
        event('Training Day', 'eyos.kind=school.term-start'),
        RULES
      ),
      null
    );
  });

  it('ignores School markers on non-School sources', () => {
    assert.equal(
      classifyCalendarEvent(
        event(
          'Training Day',
          'eyos.kind=school.training-day',
          'calendar'
        ),
        RULES
      ),
      null
    );
  });

  it('gives a valid marker precedence over private rules', () => {
    assert.deepEqual(
      classifyCalendarEvent(
        event(
          'Training Day',
          'eyos.kind=school.reopens\neyos.label=Return'
        ),
        RULES
      ),
      {
        kind: 'school.reopens',
        label: 'Return',
      }
    );
  });

  it('matches an exact private title case-insensitively after normalization', () => {
    assert.deepEqual(
      classifyCalendarEvent(
        event('  TRAINING   day  '),
        RULES
      ),
      {
        kind: 'school.training-day',
        label: 'Configured training',
      }
    );
  });

  it('uses an explicitly configured contains rule', () => {
    assert.deepEqual(
      classifyCalendarEvent(
        event('School Holiday — Autumn Half-Term'),
        RULES
      ),
      {
        kind: 'school.holiday',
        label: 'Half-term',
      }
    );
  });

  it('prefers an exact rule over a matching contains rule', () => {
    assert.deepEqual(
      classifyCalendarEvent(
        event('Autumn half-term'),
        [
          ...RULES,
          {
            sourceId: 'school',
            titleEquals: 'Autumn half-term',
            kind: 'school.holiday',
            label: 'Autumn break',
          },
        ]
      ),
      {
        kind: 'school.holiday',
        label: 'Autumn break',
      }
    );
  });

  it('leaves an unknown School event semantically unclassified', () => {
    assert.equal(
      classifyCalendarEvent(
        event('Parents evening'),
        RULES
      ),
      null
    );
  });

  it('rejects broad or malformed private rules safely', () => {
    const invalidRules = [
      {
        sourceId: 'school',
        kind: 'school.holiday',
        titleIncludes: 'a',
      },
      {
        sourceId: 'school',
        kind: 'school.term-start',
        titleEquals: 'First day',
      },
      {
        sourceId: 'school',
        kind: 'school.holiday',
        titleEquals: 'Holiday',
        titleIncludes: 'Holiday',
      },
    ];

    invalidRules.forEach(rule => {
      assert.equal(
        isValidCalendarSemanticRule(rule),
        false
      );
    });

    assert.equal(
      classifyCalendarEvent(
        event('A day'),
        invalidRules as CalendarSemanticRule[]
      ),
      null
    );
  });

  it('fails safely when matching rules are semantically ambiguous', () => {
    assert.equal(
      classifyCalendarEvent(
        event('Autumn half-term'),
        [
          {
            sourceId: 'school',
            titleEquals: 'Autumn half-term',
            kind: 'school.holiday',
          },
          {
            sourceId: 'school',
            titleEquals: 'Autumn half-term',
            kind: 'school.training-day',
          },
        ]
      ),
      null
    );
  });

  it('validates semantic rules against a configured School source', () => {
    const config: HouseholdConfig = {
      household: {
        displayName: 'Example Household',
        members: [
          {
            id: 'adult-1',
            displayName: 'Alex',
            memberType: 'adult',
          },
        ],
      },
      location: {
        name: 'Example Town',
        latitude: 51.5,
        longitude: -0.1,
        timezone: 'Europe/London',
      },
      travel: {
        homeAddress: 'Example address',
        leaveBufferMinutes: 10,
        destinations: [],
      },
      calendar: {
        endpoint: '',
        refreshMinutes: 15,
        sources: [
          {
            sourceId: 'school',
            label: 'School',
            kind: 'school',
            calendarName: 'Synthetic academic calendar',
          },
        ],
        semanticRules: [RULES[0]],
      },
    };

    assert.doesNotThrow(() =>
      validateHouseholdConfig(config, 'demo')
    );
    assert.throws(
      () => validateHouseholdConfig(
        {
          ...config,
          calendar: {
            ...config.calendar,
            semanticRules: [
              {
                ...RULES[0],
                sourceId: 'unconfigured-source',
              },
            ],
          },
        },
        'demo'
      ),
      /must reference a configured School source/
    );
    assert.throws(
      () => validateHouseholdConfig(
        {
          ...config,
          calendar: {
            ...config.calendar,
            semanticRules: [
              RULES[0],
              RULES[0],
            ],
          },
        },
        'demo'
      ),
      /is duplicated/
    );
  });
});
