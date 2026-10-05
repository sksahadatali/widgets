import {
  getAppRoute,
  type AppPage,
} from '../navigation/appRoutes';
import type {
  EffectiveDisplayProfile,
} from '../display/displayProfiles';

import {
  DEFAULT_AMBIENT_SETTINGS,
  normalizeAmbientSettings,
  type AmbientSettings,
} from './ambientSettings';
export { AMBIENT_IDLE_TIMEOUT_MS, AMBIENT_PAGE_DURATION_MS } from './ambientSettings';

export const AMBIENT_PAGE_SEQUENCE = [
  'Home',
  'Calendar',
  'Daily',
  'Rewards',
  'Lists',
  'Meals',
] as const satisfies readonly AppPage[];

export const AMBIENT_ACTIVITY_EVENTS = [
  'pointerdown',
  'mousedown',
  'mousemove',
  'touchstart',
  'keydown',
  'wheel',
] as const;

type AmbientActivityEvent =
  typeof AMBIENT_ACTIVITY_EVENTS[number];
type AmbientTimer = number;

export type AmbientRotationRuntime = {
  setTimer: (
    callback: () => void,
    delayMs: number
  ) => AmbientTimer;
  clearTimer: (timer: AmbientTimer) => void;
  addActivityListener: (
    event: AmbientActivityEvent,
    listener: () => void
  ) => void;
  removeActivityListener: (
    event: AmbientActivityEvent,
    listener: () => void
  ) => void;
  currentPath: () => string;
  navigate: (path: string) => void;
  prefetchCalendar: () => Promise<unknown>;
  hasBlockingInteraction: () => boolean;
};

export function isAmbientRotationProfile(
  profile: EffectiveDisplayProfile
): boolean {
  return (
    profile === 'desktop' ||
    profile === 'elo-touch'
  );
}

export function startAmbientRotation(
  profile: EffectiveDisplayProfile,
  runtime: AmbientRotationRuntime,
  configuration: AmbientSettings = DEFAULT_AMBIENT_SETTINGS
): () => void {
  const settings = normalizeAmbientSettings(configuration);
  if (!settings.enabled || !isAmbientRotationProfile(profile)) {
    return () => undefined;
  }

  let idleTimer: AmbientTimer | null = null;
  let pageTimer: AmbientTimer | null = null;
  let disposed = false;

  const clearIdleTimer = () => {
    if (idleTimer === null) return;
    runtime.clearTimer(idleTimer);
    idleTimer = null;
  };

  const clearPageTimer = () => {
    if (pageTimer === null) return;
    runtime.clearTimer(pageTimer);
    pageTimer = null;
  };

  const prefetchNextPage = (
    currentIndex: number
  ) => {
    const nextPage = AMBIENT_PAGE_SEQUENCE[
      (currentIndex + 1) %
        AMBIENT_PAGE_SEQUENCE.length
    ];

    if (nextPage === 'Calendar') {
      void runtime
        .prefetchCalendar()
        .catch(() => undefined);
    }
  };

  const armIdleTimer = () => {
    if (disposed) return;
    clearIdleTimer();
    idleTimer = runtime.setTimer(
      activateRotation,
      settings.inactivitySeconds * 1000
    );
  };

  const pauseForInteraction = () => {
    clearIdleTimer();
    clearPageTimer();
    armIdleTimer();
  };

  const scheduleNextPage = (
    currentIndex: number
  ) => {
    prefetchNextPage(currentIndex);
    pageTimer = runtime.setTimer(() => {
      pageTimer = null;

      if (runtime.hasBlockingInteraction()) {
        armIdleTimer();
        return;
      }

      const nextIndex =
        (currentIndex + 1) %
        AMBIENT_PAGE_SEQUENCE.length;
      const nextRoute = getAppRoute(
        AMBIENT_PAGE_SEQUENCE[nextIndex]
      );

      runtime.navigate(nextRoute.path);
      scheduleNextPage(nextIndex);
    }, settings.pageDurationSeconds[AMBIENT_PAGE_SEQUENCE[currentIndex]] * 1000);
  };

  function activateRotation() {
    idleTimer = null;

    if (runtime.hasBlockingInteraction()) {
      armIdleTimer();
      return;
    }

    const homePath = getAppRoute('Home').path;
    if (runtime.currentPath() !== homePath) {
      runtime.navigate(homePath);
    }

    scheduleNextPage(0);
  }

  for (const event of AMBIENT_ACTIVITY_EVENTS) {
    runtime.addActivityListener(
      event,
      pauseForInteraction
    );
  }
  armIdleTimer();

  return () => {
    disposed = true;
    clearIdleTimer();
    clearPageTimer();

    for (const event of AMBIENT_ACTIVITY_EVENTS) {
      runtime.removeActivityListener(
        event,
        pauseForInteraction
      );
    }
  };
}
