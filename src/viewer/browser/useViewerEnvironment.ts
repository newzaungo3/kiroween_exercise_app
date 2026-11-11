/**
 * Browser adapter: the three environment facts the Viewer reacts to.
 *
 * - `pageHidden`: `document.visibilityState === 'hidden'`, updated on `visibilitychange`.
 * - `inView`: the Viewer_Area intersects the viewport (IntersectionObserver, threshold 0).
 * - `reducedMotion`: `matchMedia('(prefers-reduced-motion: reduce)')`, updated on change.
 *
 * No decisions here: the Viewer controller decides what each fact means.
 *
 * SSR-safe: nothing touches `window` or `document` during render. On the
 * server and during hydration the values are `pageHidden: false`,
 * `inView: true` and `reducedMotion: false`; React switches to the browser's
 * real visibility and motion values right after hydration, and `inView`
 * follows the first IntersectionObserver report. Used only by the
 * `'use client'` ViewerIsland.
 */
import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';

export interface ViewerEnvironment {
  readonly pageHidden: boolean;
  readonly inView: boolean;
  readonly reducedMotion: boolean;
}

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

// --- Page_Hidden -----------------------------------------------------------

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

function getPageHidden(): boolean {
  return document.visibilityState === 'hidden';
}

function getServerPageHidden(): boolean {
  return false;
}

// --- Reduced_Motion_Preference ---------------------------------------------

function reducedMotionList(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(reducedMotionQuery) : null;
}

function subscribeReducedMotion(onChange: () => void): () => void {
  const list = reducedMotionList();
  if (list === null) return () => undefined;
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

function getReducedMotion(): boolean {
  return reducedMotionList()?.matches ?? false;
}

function getServerReducedMotion(): boolean {
  return false;
}

// --- Hook ------------------------------------------------------------------

/**
 * Reports whether the page is hidden, whether `target` (the Viewer_Area)
 * intersects the viewport, and whether the Reduced_Motion_Preference is set.
 * Each value updates when the browser reports a change.
 */
export function useViewerEnvironment(target: RefObject<Element | null>): ViewerEnvironment {
  const pageHidden = useSyncExternalStore(subscribeVisibility, getPageHidden, getServerPageHidden);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, getServerReducedMotion);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const element = target.current;
    if (element === null || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const latest = entries[entries.length - 1];
        if (latest !== undefined) setInView(latest.isIntersecting);
      },
      { threshold: 0 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [target]);

  return { pageHidden, inView, reducedMotion };
}
