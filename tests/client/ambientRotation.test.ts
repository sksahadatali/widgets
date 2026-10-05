import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  describe,
  it,
} from 'node:test';

import {
  AMBIENT_ACTIVITY_EVENTS,
  AMBIENT_IDLE_TIMEOUT_MS,
  AMBIENT_PAGE_DURATION_MS,
  AMBIENT_PAGE_SEQUENCE,
  startAmbientRotation,
  type AmbientRotationRuntime,
} from '../../app/src/ambient/ambientRotation';
import type {
  EffectiveDisplayProfile,
} from '../../app/src/display/displayProfiles';

import { DEFAULT_AMBIENT_SETTINGS, type AmbientSettings } from '../../app/src/ambient/ambientSettings';

type TimerEntry = {
  id: number;
  dueAt: number;
  callback: () => void;
};

class AmbientHarness {
  now = 0;
  path = '/';
  blocked = false;
  navigations: Array<{
    path: string;
    at: number;
  }> = [];
  prefetches: number[] = [];
  scheduledDelays: number[] = [];
  removedListeners = 0;

  private nextTimerId = 1;
  private timers = new Map<number, TimerEntry>();
  private listeners = new Map<
    string,
    Set<() => void>
  >();

  runtime: AmbientRotationRuntime = {
    setTimer: (callback, delayMs) => {
      const id = this.nextTimerId++;
      this.scheduledDelays.push(delayMs);
      this.timers.set(id, {
        id,
        dueAt: this.now + delayMs,
        callback,
      });
      return id;
    },
    clearTimer: timer => {
      this.timers.delete(timer);
    },
    addActivityListener: (event, listener) => {
      const listeners =
        this.listeners.get(event) ?? new Set();
      listeners.add(listener);
      this.listeners.set(event, listeners);
    },
    removeActivityListener: (event, listener) => {
      if (this.listeners.get(event)?.delete(listener)) {
        this.removedListeners += 1;
      }
    },
    currentPath: () => this.path,
    navigate: path => {
      this.path = path;
      this.navigations.push({ path, at: this.now });
    },
    prefetchCalendar: async () => {
      this.prefetches.push(this.now);
    },
    hasBlockingInteraction: () => this.blocked,
  };

  advanceBy(milliseconds: number) {
    const target = this.now + milliseconds;

    while (true) {
      const next = [...this.timers.values()]
        .filter(timer => timer.dueAt <= target)
        .sort((left, right) =>
          left.dueAt - right.dueAt ||
          left.id - right.id
        )[0];

      if (!next) break;
      this.now = next.dueAt;
      this.timers.delete(next.id);
      next.callback();
    }

    this.now = target;
  }

  activity(event = 'pointerdown') {
    for (
      const listener of
        this.listeners.get(event) ?? []
    ) {
      listener();
    }
  }

  get listenerCount() {
    return [...this.listeners.values()]
      .reduce(
        (count, listeners) =>
          count + listeners.size,
        0
      );
  }

  get timerCount() {
    return this.timers.size;
  }
}

function start(
  profile: EffectiveDisplayProfile,
  path = '/',
  settings: AmbientSettings = {
    ...DEFAULT_AMBIENT_SETTINGS,
    pageDurationSeconds: { ...DEFAULT_AMBIENT_SETTINGS.pageDurationSeconds, Home: 25 },
  }
) {
  const harness = new AmbientHarness();
  harness.path = path;
  const dispose = startAmbientRotation(
    profile,
    harness.runtime,
    settings
  );
  return { harness, dispose };
}

describe('Ambient Rotation Phase 1', () => {

  it('uses two minutes on Home on every loop with the default configuration', () => {
    const { harness } = start('desktop', '/', DEFAULT_AMBIENT_SETTINGS);
    harness.advanceBy(120_000);
    harness.advanceBy(119_999);
    assert.equal(harness.path, '/');
    harness.advanceBy(1);
    assert.equal(harness.path, '/calendar');
    for (let index = 0; index < 5; index++) harness.advanceBy(25_000);
    assert.equal(harness.path, '/');
    harness.advanceBy(119_999);
    assert.equal(harness.path, '/');
    harness.advanceBy(1);
    assert.equal(harness.path, '/calendar');
  });

  it('honours a custom idle threshold and each page duration', () => {
    const settings: AmbientSettings = {
      version: 1, enabled: true, inactivitySeconds: 60,
      pageDurationSeconds: { Home: 10, Calendar: 20, Daily: 30, Rewards: 40, Lists: 50, Meals: 60 },
    };
    const { harness } = start('elo-touch', '/rewards', settings);
    harness.advanceBy(59_999);
    assert.equal(harness.path, '/rewards');
    harness.advanceBy(1);
    assert.equal(harness.path, '/');
    let expectedAt = 60_000;
    const paths = ['/calendar', '/daily', '/rewards', '/lists', '/meals', '/'];
    AMBIENT_PAGE_SEQUENCE.forEach((page, index) => {
      const duration = settings.pageDurationSeconds[page] * 1000;
      harness.advanceBy(duration - 1);
      assert.equal(harness.navigations.length, index + 1);
      harness.advanceBy(1);
      expectedAt += duration;
      assert.deepEqual(harness.navigations.at(-1), { path: paths[index], at: expectedAt });
    });
  });

  it('attaches no timers or listeners when disabled on Desktop or Elo', () => {
    for (const profile of ['desktop', 'elo-touch'] as const) {
      const { harness } = start(profile, '/calendar', { ...DEFAULT_AMBIENT_SETTINGS, enabled: false });
      harness.advanceBy(1_000_000);
      assert.equal(harness.timerCount, 0);
      assert.equal(harness.listenerCount, 0);
      assert.equal(harness.path, '/calendar');
    }
  });

  it('blocks the next configured transition while an editor is active', () => {
    const { harness } = start('desktop', '/', DEFAULT_AMBIENT_SETTINGS);
    harness.advanceBy(120_000);
    harness.blocked = true;
    harness.advanceBy(120_000);
    assert.equal(harness.path, '/');
    harness.blocked = false;
    harness.advanceBy(120_000);
    assert.equal(harness.path, '/');
    harness.advanceBy(120_000);
    assert.equal(harness.path, '/calendar');
  });

  it('does not activate before the idle threshold', () => {
    const { harness } = start('desktop', '/rewards');

    harness.advanceBy(AMBIENT_IDLE_TIMEOUT_MS - 1);

    assert.deepEqual(harness.navigations, []);
  });

  for (const profile of [
    'desktop',
    'elo-touch',
  ] as const) {
    it(`activates after the idle threshold on ${profile}`, () => {
      const { harness } = start(profile, '/lists');

      harness.advanceBy(AMBIENT_IDLE_TIMEOUT_MS);

      assert.equal(harness.path, '/');
      assert.deepEqual(
        harness.navigations.map(entry => entry.path),
        ['/']
      );
    });
  }

  it('does not attach timers or rotate in Compact', () => {
    const { harness } = start('compact', '/lists');

    harness.advanceBy(
      AMBIENT_IDLE_TIMEOUT_MS +
      AMBIENT_PAGE_DURATION_MS * 2
    );

    assert.equal(harness.timerCount, 0);
    assert.equal(harness.listenerCount, 0);
    assert.deepEqual(harness.navigations, []);
  });

  it('continues the full sequence at page intervals without another idle delay', () => {
    const { harness } = start('desktop');
    harness.advanceBy(AMBIENT_IDLE_TIMEOUT_MS);

    for (
      let index = 0;
      index < AMBIENT_PAGE_SEQUENCE.length;
      index += 1
    ) {
      harness.advanceBy(AMBIENT_PAGE_DURATION_MS);
    }

    assert.deepEqual(
      harness.navigations.map(entry => entry.path),
      [
        '/calendar',
        '/daily',
        '/rewards',
        '/lists',
        '/meals',
        '/',
      ]
    );
    assert.deepEqual(
      harness.navigations.map(entry => entry.at),
      AMBIENT_PAGE_SEQUENCE.map((_, index) =>
        AMBIENT_IDLE_TIMEOUT_MS +
        AMBIENT_PAGE_DURATION_MS *
          (index + 1)
      )
    );
  });

  it('uses the configured page duration for every transition', () => {
    const { harness } = start('desktop');
    harness.advanceBy(AMBIENT_IDLE_TIMEOUT_MS);

    harness.advanceBy(AMBIENT_PAGE_DURATION_MS - 1);
    assert.deepEqual(harness.navigations, []);
    harness.advanceBy(1);
    assert.equal(harness.path, '/calendar');

    assert.ok(
      harness.scheduledDelays
        .slice(1)
        .every(delay =>
          delay === AMBIENT_PAGE_DURATION_MS
        )
    );
  });

  it('immediately cancels active rotation on user interaction', () => {
    const { harness } = start('desktop');
    harness.advanceBy(AMBIENT_IDLE_TIMEOUT_MS);
    harness.advanceBy(AMBIENT_PAGE_DURATION_MS - 1);

    harness.activity('pointerdown');
    harness.advanceBy(1);

    assert.equal(harness.path, '/');
    assert.deepEqual(harness.navigations, []);
  });

  it('restarts from Home after a new full inactivity period', () => {
    const { harness } = start('desktop');
    harness.advanceBy(
      AMBIENT_IDLE_TIMEOUT_MS +
      AMBIENT_PAGE_DURATION_MS
    );
    assert.equal(harness.path, '/calendar');

    harness.activity('keydown');
    harness.advanceBy(AMBIENT_IDLE_TIMEOUT_MS - 1);
    assert.equal(harness.path, '/calendar');
    harness.advanceBy(1);
    assert.equal(harness.path, '/');
    harness.advanceBy(AMBIENT_PAGE_DURATION_MS);
    assert.equal(harness.path, '/calendar');
  });

  it('prefetches Calendar before displaying it', () => {
    const { harness } = start('desktop');
    harness.advanceBy(AMBIENT_IDLE_TIMEOUT_MS);

    assert.deepEqual(
      harness.prefetches,
      [AMBIENT_IDLE_TIMEOUT_MS]
    );
    assert.deepEqual(harness.navigations, []);

    harness.advanceBy(AMBIENT_PAGE_DURATION_MS);
    assert.equal(harness.path, '/calendar');
    assert.ok(
      harness.prefetches[0] <
      harness.navigations[0].at
    );
  });

  it('does not navigate while a supported interaction is active', () => {
    const { harness } = start('elo-touch', '/rewards');
    harness.blocked = true;

    harness.advanceBy(AMBIENT_IDLE_TIMEOUT_MS);

    assert.equal(harness.path, '/rewards');
    assert.deepEqual(harness.navigations, []);
    assert.equal(harness.timerCount, 1);
  });

  it('cleans up timers and every global activity listener', () => {
    const { harness, dispose } = start('desktop');
    assert.equal(
      harness.listenerCount,
      AMBIENT_ACTIVITY_EVENTS.length
    );

    dispose();
    harness.advanceBy(
      AMBIENT_IDLE_TIMEOUT_MS +
      AMBIENT_PAGE_DURATION_MS
    );

    assert.equal(harness.timerCount, 0);
    assert.equal(harness.listenerCount, 0);
    assert.equal(
      harness.removedListeners,
      AMBIENT_ACTIVITY_EVENTS.length
    );
    assert.deepEqual(harness.navigations, []);
  });

  it('keeps Calendar prefetch and sidebar selection route-driven', async () => {
    const [hook, sidebar, app] = await Promise.all([
      readFile(
        new URL(
          '../../app/src/ambient/useAmbientRotation.ts',
          import.meta.url
        ),
        'utf8'
      ),
      readFile(
        new URL(
          '../../app/src/components/layout/Sidebar/Sidebar.tsx',
          import.meta.url
        ),
        'utf8'
      ),
      readFile(
        new URL(
          '../../app/src/App.tsx',
          import.meta.url
        ),
        'utf8'
      ),
    ]);

    assert.match(
      hook,
      /prefetchCalendarWindow\(\)/
    );
    assert.match(
      hook,
      /navigateRef\.current\([\s\S]*?path,[\s\S]*?\{ replace: true \}/
    );
    assert.match(sidebar, /<NavLink/);
    assert.match(
      sidebar,
      /className=\{\(\{ isActive \}\) =>/
    );
    assert.equal(
      app.match(/<AmbientRotationController \/>/g)
        ?.length,
      1
    );
  });

  it('does not restart the controller when React Router changes navigate identity', async () => {
    const hook = await readFile(
      new URL(
        '../../app/src/ambient/useAmbientRotation.ts',
        import.meta.url
      ),
      'utf8'
    );

    assert.match(
      hook,
      /const navigateRef = useRef\(navigate\);/
    );
    assert.match(
      hook,
      /navigateRef\.current = navigate;/
    );
    assert.match(
      hook,
      /useEffect\(\(\) => \{[\s\S]*?startAmbientRotation[\s\S]*?\}, \[effectiveProfile, settings\]\);/
    );
    assert.doesNotMatch(
      hook,
      /\[effectiveProfile, navigate\]/
    );
  });
});
