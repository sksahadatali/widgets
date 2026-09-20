import assert from 'node:assert/strict';
import {
  readFile,
} from 'node:fs/promises';
import test from 'node:test';
import {
  createElement,
} from 'react';
import {
  renderToStaticMarkup,
} from 'react-dom/server';

import {
  MobileMenuButton,
} from '../../app/src/components/layout/Header/MobileMenuButton';
import {
  APP_ROUTES,
} from '../../app/src/navigation/appRoutes';
import {
  createNavigationSelectionHandler,
} from '../../app/src/navigation/mobileNavigation';
import {
  MEAL_TYPES,
  MEAL_TYPE_LABELS,
  selectMealPlanWindow,
} from '../../app/src/meals/mealSelectors';

test('mobile navigation preserves the Phase A route model', () => {
  assert.deepEqual(
    APP_ROUTES.map(route => route.page),
    [
      'Home',
      'Calendar',
      'Daily',
      'Rewards',
      'Lists',
      'Meals',
      'Personal',
      'RAEN',
      'AYANOH',
      'Settings',
    ]
  );
});

test('Calendar uses the shared route and responsive display-profile architecture', async () => {
  const pageSource = await readFile(
    new URL('../../app/src/pages/WeeklyCalendar.tsx', import.meta.url),
    'utf8'
  );
  const pageStyles = await readFile(
    new URL('../../app/src/pages/WeeklyCalendar.css', import.meta.url),
    'utf8'
  );

  assert.match(pageSource, /selectCalendarWindow/);
  assert.match(pageSource, /<h1>Calendar<\/h1>/);
  assert.doesNotMatch(pageSource, />Weekly Calendar</);
  assert.match(pageSource, /CalendarPeoplePicker/);
  assert.match(pageSource, /CalendarSourceIndicator/);
  assert.match(pageSource, /aria-pressed={view === 'month'}/);
  assert.match(pageSource, /selectCalendarMonthGrid/);
  assert.match(pageSource, /month-calendar-scroll/);
  assert.match(pageSource, /\+ {hiddenCount} more/);
  assert.doesNotMatch(pageSource, /CalendarAssignmentAvatars/);
  assert.match(pageSource, /event\.description/);
  assert.match(pageStyles, /data-display-profile='compact'/);
  assert.match(pageStyles, /data-display-profile='elo-touch'/);
  assert.match(pageStyles, /@media \(max-width: 700px\)/);
  assert.match(pageStyles, /overflow-x: auto/);
  assert.match(pageStyles, /\.month-calendar/);
  assert.match(pageStyles, /grid-template-columns: repeat\(7/);
  assert.match(pageStyles, /\.month-day__more/);
});

test('mobile drawer consumes the shared route model', async () => {
  const sidebarSource = await readFile(
    new URL(
      '../../app/src/components/layout/Sidebar/Sidebar.tsx',
      import.meta.url
    ),
    'utf8'
  );

  assert.match(sidebarSource, /APP_ROUTES\.map/);
  assert.match(sidebarSource, /primary-navigation-drawer/);
  assert.match(sidebarSource, /sidebar--mobile-open/);
  assert.match(sidebarSource, /aria-modal/);
});

test('mobile menu trigger exposes accessible drawer state', () => {
  const closedMarkup = renderToStaticMarkup(
    createElement(MobileMenuButton, {
      isMenuOpen: false,
      onMenuToggle: () => undefined,
    })
  );
  const openMarkup = renderToStaticMarkup(
    createElement(MobileMenuButton, {
      isMenuOpen: true,
      onMenuToggle: () => undefined,
    })
  );

  assert.match(closedMarkup, /aria-label="Open navigation menu"/);
  assert.match(closedMarkup, /aria-expanded="false"/);
  assert.match(
    closedMarkup,
    /aria-controls="primary-navigation-drawer"/
  );
  assert.match(openMarkup, /aria-expanded="true"/);
});

test('destination selection invokes the drawer-closing callback', () => {
  let closeCount = 0;
  const handleSelection = createNavigationSelectionHandler(
    () => {
      closeCount += 1;
    }
  );

  handleSelection();
  assert.equal(closeCount, 1);
});

test('responsive Meals retains seven semantic days and three meal slots', () => {
  const days = selectMealPlanWindow(
    [],
    '2026-08-31',
    '2026-08-31'
  );

  assert.equal(days.length, 7);
  assert.deepEqual(MEAL_TYPES, [
    'breakfast',
    'lunch',
    'dinner',
  ]);
  assert.deepEqual(
    MEAL_TYPES.map(type => MEAL_TYPE_LABELS[type]),
    ['Breakfast', 'Lunch', 'Dinner']
  );

  for (const day of days) {
    assert.deepEqual(
      Object.keys(day.entries),
      MEAL_TYPES
    );
  }
});

test('Meals responsive markup preserves actions and dialog workflows', async () => {
  const mealsSource = await readFile(
    new URL('../../app/src/pages/Meals.tsx', import.meta.url),
    'utf8'
  );
  const mealsStyles = await readFile(
    new URL('../../app/src/pages/Meals.css', import.meta.url),
    'utf8'
  );

  assert.match(mealsSource, /windowDays\.map/);
  assert.match(mealsSource, /MEAL_TYPES\.map/);
  assert.match(
    mealsSource,
    /aria-label={`Add \$\{MEAL_TYPE_LABELS\[mealType\]\}/
  );
  assert.match(mealsSource, /aria-label={`Actions for \$\{entry\.title\}`}/);
  assert.match(mealsSource, /beginAction\(entry, 'edit'\)/);
  assert.match(mealsSource, /beginAction\(entry, 'move'\)/);
  assert.match(mealsSource, /beginAction\(entry, 'copy'\)/);
  assert.match(mealsSource, /submitRemove/);
  assert.match(mealsSource, /<MealDialog/);

  assert.match(mealsStyles, /@media \(max-width: 700px\)/);
  assert.match(
    mealsStyles,
    /\.meals-window__headings\s*{\s*display: none;/
  );
  assert.match(
    mealsStyles,
    /\.meals-day__slots\s*{\s*display: grid;/
  );
  assert.match(
    mealsStyles,
    /\.meals-slot__header \.meals-sr-only/
  );
});
