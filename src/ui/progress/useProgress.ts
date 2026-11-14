'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type {
  CoachNameResult,
  EquipResult,
  ProgressSnapshot,
  RecordResult,
  SaveCheckpointResult,
  UnlockRequest,
  UnlockResult,
  WorkoutRecord,
} from '@/progress-store';
import type { WorkoutCheckpoint } from '@/workout-engine';

import {
  getPageStore,
  readPageSnapshot,
  readServerSnapshot,
  subscribePageStore,
} from './page-store';

export { coachNameMaxLength, normaliseCoachName } from '@/progress-store';
export type {
  CoachNameResult,
  EquipResult,
  UnlockRequest,
  UnlockResult,
} from '@/progress-store';

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
  /** Spends Candy to Unlock a Coach color or Accessory and equips it. */
  readonly unlock: (request: UnlockRequest) => UnlockResult;
  /** null equips the Default_Coach_Color. */
  readonly equipColor: (id: string | null) => EquipResult;
  readonly setAccessoryEquipped: (id: string, equipped: boolean) => EquipResult;
  readonly setCoachName: (text: string) => CoachNameResult;
}

export function useProgress(): ProgressApi {
  const snapshot = useSyncExternalStore(subscribePageStore, readPageSnapshot, readServerSnapshot);
  const [welcomeJustGranted, setWelcomeJustGranted] = useState(false);

  useEffect(() => {
    // Strict Mode's second run returns false; it must not reset the flag.
    if (getPageStore().grantWelcomeGift()) setWelcomeJustGranted(true);
  }, []);

  const ensureWelcomeGift = useCallback((): void => {
    getPageStore().grantWelcomeGift();
  }, []);
  const saveCheckpoint = useCallback(
    (checkpoint: WorkoutCheckpoint): SaveCheckpointResult =>
      getPageStore().saveCheckpoint(checkpoint),
    [],
  );
  const clearCheckpoint = useCallback((): boolean => getPageStore().clearCheckpoint(), []);
  const finishWorkout = useCallback(
    (record: WorkoutRecord): RecordResult => getPageStore().finishWorkout(record),
    [],
  );
  const unlock = useCallback(
    (request: UnlockRequest): UnlockResult => getPageStore().unlock(request),
    [],
  );
  const equipColor = useCallback(
    (id: string | null): EquipResult => getPageStore().equipColor(id),
    [],
  );
  const setAccessoryEquipped = useCallback(
    (id: string, equipped: boolean): EquipResult =>
      getPageStore().setAccessoryEquipped(id, equipped),
    [],
  );
  const setCoachName = useCallback(
    (text: string): CoachNameResult => getPageStore().setCoachName(text),
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
      unlock,
      equipColor,
      setAccessoryEquipped,
      setCoachName,
    }),
    [
      snapshot,
      welcomeJustGranted,
      ensureWelcomeGift,
      saveCheckpoint,
      clearCheckpoint,
      finishWorkout,
      unlock,
      equipColor,
      setAccessoryEquipped,
      setCoachName,
    ],
  );
}
