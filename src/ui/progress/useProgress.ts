'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  createLocalStorageAdapter,
  createProgressStore,
  type ProgressSnapshot,
  type ProgressStore,
  type RecordResult,
  type SaveCheckpointResult,
  type WorkoutRecord,
} from '@/progress-store';
import type { WorkoutCheckpoint } from '@/workout-engine';

export interface ProgressApi {
  /** null until the browser has read storage. */
  readonly snapshot: ProgressSnapshot | null;
  /** True during the visit in which this screen's mount granted the gift. */
  readonly welcomeJustGranted: boolean;
  readonly ensureWelcomeGift: () => void;
  readonly saveCheckpoint: (checkpoint: WorkoutCheckpoint) => SaveCheckpointResult;
  /** True if a checkpoint was cleared by this call. */
  readonly clearCheckpoint: () => boolean;
  /** Records the Workout and clears the checkpoint in one write. */
  readonly finishWorkout: (record: WorkoutRecord) => RecordResult;
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

  const ensureWelcomeGift = useCallback((): void => {
    getStore().grantWelcomeGift();
  }, []);
  const saveCheckpoint = useCallback(
    (checkpoint: WorkoutCheckpoint): SaveCheckpointResult =>
      getStore().saveCheckpoint(checkpoint),
    [],
  );
  const clearCheckpoint = useCallback((): boolean => getStore().clearCheckpoint(), []);
  const finishWorkout = useCallback(
    (record: WorkoutRecord): RecordResult => getStore().finishWorkout(record),
    [],
  );

  return useMemo(
    () => ({
      snapshot,
      welcomeJustGranted,
      ensureWelcomeGift,
      saveCheckpoint,
      clearCheckpoint,
      finishWorkout,
    }),
    [snapshot, welcomeJustGranted, ensureWelcomeGift, saveCheckpoint, clearCheckpoint, finishWorkout],
  );
}
