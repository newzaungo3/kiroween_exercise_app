'use client';

import { useEffect, useRef } from 'react';

/** Pure: auto-pause only when enabled and the document is hidden. */
export function shouldAutoPause(
  visibilityState: DocumentVisibilityState,
  enabled: boolean,
): boolean {
  return enabled && visibilityState === 'hidden';
}

/**
 * Calls `onHidden` when the page becomes hidden while `enabled`, and once
 * at once when enabled while already hidden. Reads no clock.
 */
export function useOnPageHidden(onHidden: () => void, enabled: boolean): void {
  const handlerRef = useRef(onHidden);
  useEffect(() => {
    handlerRef.current = onHidden;
  });

  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      if (shouldAutoPause(document.visibilityState, enabled)) handlerRef.current();
    };
    document.addEventListener('visibilitychange', check);
    check();
    return () => document.removeEventListener('visibilitychange', check);
  }, [enabled]);
}
