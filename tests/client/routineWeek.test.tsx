import assert from 'node:assert/strict';
import {
  readFile,
} from 'node:fs/promises';
import {
  describe,
  it,
} from 'node:test';
import {
  createElement,
} from 'react';
import {
  renderToStaticMarkup,
} from 'react-dom/server';

import RoutineWeek from '../../app/src/components/routines/RoutineWeek/RoutineWeek.tsx';
import type {
  RoutineDefinition,
  RoutineOccurrence,
} from '../../app/src/types/routine.ts';

const kumon: RoutineDefinition = {
  id: 'kumon',
  title: 'Kumon',
  ownerProfileId: 'child-1',
  active: true,
  schedule: {
    daysOfWeek: [1],
    startTime: null,
    endTime: null,
  },
  steps: [
    { id: 'math', title: 'Math' },
    { id: 'english', title: 'English' },
  ],
  reward: {
    recipientProfileId: 'child-1',
    currency: 'star',
    amount: 1,
  },
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const floor: RoutineDefinition = {
  ...kumon,
  id: 'clean-floor',
  title: 'Clean the floor',
  ownerProfileId: 'family',
  steps: [],
  reward: null,
};

const kumonOccurrence: RoutineOccurrence = {
  id: 'kumon@2026-09-21',
  routineId: 'kumon',
  localDate: '2026-09-21',
  timeZone: 'Europe/London',
  snapshot: {
    title: kumon.title,
    ownerProfileId: kumon.ownerProfileId,
    schedule: structuredClone(kumon.schedule),
    steps: structuredClone(kumon.steps),
    definitionUpdatedAt: kumon.updatedAt,
    capturedAt: '2026-09-21T06:00:00.000Z',
    source: 'captured',
  },
  rewardContract: structuredClone(kumon.reward),
  completionSequence: 0,
  completedSteps: {
    math: '2026-09-21T07:00:00.000Z',
  },
  completedAt: null,
  updatedAt: '2026-09-21T07:00:00.000Z',
};

describe('compact Routine week presentation', () => {
  it('presents Daily as recurring Routines while preserving the route architecture', async () => {
    const [page, sidebar, focus] = await Promise.all([
      readFile(
        new URL('../../app/src/pages/Daily.tsx', import.meta.url),
        'utf8'
      ),
      readFile(
        new URL('../../app/src/components/layout/Sidebar/Sidebar.tsx', import.meta.url),
        'utf8'
      ),
      readFile(
        new URL('../../app/src/components/modules/TodaysFocus/TodaysFocus.tsx', import.meta.url),
        'utf8'
      ),
    ]);

    assert.match(page, /<h1>Routines<\/h1>/);
    assert.match(page, />\s*Household routines\s*</);
    assert.match(
      page,
      /Recurring family and household activities\s*scheduled on their selected weekdays\./
    );
    assert.match(
      page,
      /Choosing one\s*day creates a weekly routine, not a one-off task\./
    );
    assert.match(sidebar, /getAppPageLabel\(route\.page\)/);
    assert.match(focus, /in Routines/);
  });

  it('keeps the legacy Kumon experience out of the Today workspace', async () => {
    const source = await readFile(
      new URL(
        '../../app/src/pages/Daily.tsx',
        import.meta.url
      ),
      'utf8'
    );

    assert.doesNotMatch(source, /KumonToday/);
    assert.match(source, /Family routines today/);
  });

  it('renders one seven-day grid with ordinary multi-step and step-less actions', () => {
    const markup = renderToStaticMarkup(
      createElement(RoutineWeek, {
        routines: [kumon, floor],
        occurrences: [kumonOccurrence],
        profiles: [
          {
            id: 'family',
            kind: 'family',
            displayName: 'Example Household',
          },
          {
            id: 'child-1',
            kind: 'member',
            displayName: 'Rehan',
            memberType: 'child',
          },
        ],
        selectedProfileId: 'family',
        householdToday: '2026-09-21',
        loading: false,
        saving: false,
        onStepChange: async () => undefined,
        onRoutineChange: async () => undefined,
      })
    );

    assert.equal(
      (markup.match(/routine-week-day(?: |")/g) ?? [])
        .length,
      7
    );
    assert.match(markup, />Mon</);
    assert.match(markup, />Sun</);
    assert.match(markup, />Today</);
    assert.match(markup, />Kumon</);
    assert.match(markup, />Math</);
    assert.match(markup, />English</);
    assert.match(markup, />Clean the floor</);
    assert.match(markup, />Complete</);
    assert.match(markup, />Previous 7 days</);
    assert.match(markup, />Next 7 days</);
    assert.doesNotMatch(markup, /Kumon Today/);
  });

  it('keeps seven columns on one row and scrolls only the grid', async () => {
    const css = await readFile(
      new URL(
        '../../app/src/pages/Daily.css',
        import.meta.url
      ),
      'utf8'
    );

    assert.match(
      css,
      /\.routine-week__grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(\s*7,/m
    );
    assert.match(
      css,
      /\.routine-week__scroll\s*\{[\s\S]*overflow-x:\s*auto;/m
    );
    assert.doesNotMatch(
      css,
      /\.routine-week__grid\s*\{[^}]*grid-template-columns:\s*1fr;/m
    );
  });
});
