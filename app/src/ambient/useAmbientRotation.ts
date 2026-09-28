import {
  useEffect,
  useRef,
} from 'react';
import {
  useLocation,
  useNavigate,
} from 'react-router-dom';

import {
  prefetchCalendarWindow,
} from '../calendar/calendarQueryStore';
import {
  useDisplayProfile,
} from '../display/useDisplayProfile';
import {
  startAmbientRotation,
} from './ambientRotation';

const BLOCKING_INTERACTION_SELECTOR = [
  'dialog[open]',
  '[role="dialog"][aria-modal="true"]',
  '[role="alertdialog"][aria-modal="true"]',
  '.routine-editor',
  '.lists-inline-editor',
  '.meals-editor',
  '.task-editor',
  '.due-soon__editor',
  '.tasks__editor',
  '.redemption-editor',
  '.calendar-event-editor',
  '.kumon-editor',
].join(', ');

const EDITABLE_CONTROL_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
].join(', ');

export function hasActiveAmbientInteraction(): boolean {
  if (
    document.querySelector(
      BLOCKING_INTERACTION_SELECTOR
    )
  ) {
    return true;
  }

  return Boolean(
    document.activeElement?.matches(
      EDITABLE_CONTROL_SELECTOR
    )
  );
}

export function useAmbientRotation(): void {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    effectiveProfile,
  } = useDisplayProfile();
  const pathRef = useRef(location.pathname);
  const navigateRef = useRef(navigate);
  pathRef.current = location.pathname;
  navigateRef.current = navigate;

  useEffect(() => {
    return startAmbientRotation(
      effectiveProfile,
      {
        setTimer: (callback, delayMs) =>
          window.setTimeout(callback, delayMs),
        clearTimer: timer =>
          window.clearTimeout(timer),
        addActivityListener: (event, listener) =>
          window.addEventListener(event, listener),
        removeActivityListener: (event, listener) =>
          window.removeEventListener(event, listener),
        currentPath: () => pathRef.current,
        navigate: path =>
          navigateRef.current(
            path,
            { replace: true }
          ),
        prefetchCalendar: () =>
          prefetchCalendarWindow(),
        hasBlockingInteraction:
          hasActiveAmbientInteraction,
      }
    );
  }, [effectiveProfile]);
}
