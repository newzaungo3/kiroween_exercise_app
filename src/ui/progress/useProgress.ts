'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  createLocalStorageAdapter,
  createProgressStore,
  type ProgressSnapshot,
  type ProgressStore,
  type RecordResult,
  type WorkoutRecord,
} from '@/progress-store';

export interface ProgressApi {
  /** null until the browser has read storage. */
  readonly snapshot: ProgressSnapshot | null;
  /** True during the visit in which this screen's mount granted the gift. */
  readonly welcomeJustGranted: boolean;
  readonly recordWorkout: (record: WorkoutRecord) => RecordResult;
  readonly ensureWelcomeGift: () => void;
}

// One store per page, created lazily so it never exists during server rendering.
let store: ProgressStore | null = null;

function getStore(): ProgressStore {
  if (store === null) store = createProgressStore(createLocalStorageAdapter());
  return store;
}

function subscribe(listener: () => void): () => void {
  return getStore().subscribe(listener);
}

const getSnapshot = (): ProgressSnapshot => getStore().snapshot();
const getServerSnapshot = (): null => null;

export function useProgress(): ProgressApi {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [welcomeJustGranted, setWelcomeJustGranted] = useState(false);

  useEffect(() => {
    // Strict Mode's second run returns false; it must not reset the flag.
    if (getStore().grantWelcomeGift()) setWelcomeJustGranted(true);
  }, []);

  const recordWorkout = useCallback(
    (record: WorkoutRecord): RecordResult => getStore().recordWorkout(record),
    [],
  );
  const ensureWelcomeGift = useCallback((): void => {
    getStore().grantWelcomeGift();
  }, []);

  return useMemo(
    () => ({ snapshot, welcomeJustGranted, recordWorkout, ensureWelcomeGift }),
    [snapshot, welcomeJustGranted, recordWorkout, ensureWelcomeGift],
  );
}
