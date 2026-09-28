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
  path = '/'
) {
  const harness = new AmbientHarness();
  harness.path = path;
  const dispose = startAmbientRotation(
    profile,
    harness.runtime
  );
  return { harness, dispose };
}

describe('Ambient Rotation Phase 1', () => {
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
      /useEffect\(\(\) => \{[\s\S]*?startAmbientRotation[\s\S]*?\}, \[effectiveProfile\]\);/
    );
    assert.doesNotMatch(
      hook,
      /\[effectiveProfile, navigate\]/
    );
  });
});
