'use client';

/**
 * Read_Only_Bridge: the equipped look and the Coach name for screens that only
 * browse. It reads the page store's snapshot and nothing else; it never
 * writes. The server render and hydration see the default look and no name.
 */
import { useSyncExternalStore } from 'react';

import { defaultLook, resolveLook, type EquippedLook } from '../crypt/look';
import { readPageSnapshot, subscribePageStore } from './page-store';

export interface CoachLookView {
  /** false until the snapshot is read. */
  readonly read: boolean;
  /** defaultLook until read. */
  readonly look: EquippedLook;
  /** null until read or when none is stored. */
  readonly coachName: string | null;
}

const unread: CoachLookView = { read: false, look: defaultLook, coachName: null };

// useSyncExternalStore needs a stable value while the snapshot is unchanged.
let lastSnapshot: ReturnType<typeof readPageSnapshot> | null = null;
let lastView: CoachLookView = unread;

function readView(): CoachLookView {
  const snapshot = readPageSnapshot();
  if (snapshot !== lastSnapshot) {
    lastSnapshot = snapshot;
    lastView = { read: true, look: resolveLook(snapshot), coachName: snapshot.coach.name };
  }
  return lastView;
}

// Server rendering and hydration: no snapshot, so the unread view.
const readServerView = (): CoachLookView => unread;

export function useCoachLook(): CoachLookView {
  return useSyncExternalStore(subscribePageStore, readView, readServerView);
}
