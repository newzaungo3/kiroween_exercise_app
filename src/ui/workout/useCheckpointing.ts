'use client';

import { useCallback, useEffect, useRef } from 'react';

import { checkpointOf } from '@/workout-engine';
import type { Workout, WorkoutCheckpoint } from '@/workout-engine';

import { checkpointIntervalMs, checkpointKey } from './checkpoint-plan';

/**
 * Hands the Workout's checkpoint to `onCheckpoint` on every Checkpoint_Moment,
 * every few seconds while a Set or Rest runs, and on a Checkpoint_Flush when
 * the page hides. Reads no clock and touches no storage.
 */
export function useCheckpointing(
  workout: Workout | null,
  onCheckpoint: ((checkpoint: WorkoutCheckpoint) => void) | undefined,
): void {
  const workoutRef = useRef(workout);
  workoutRef.current = workout;
  const callbackRef = useRef(onCheckpoint);
  callbackRef.current = onCheckpoint;

  const save = useCallback(() => {
    const current = workoutRef.current;
    if (current === null) return;
    const checkpoint = checkpointOf(current);
    if (checkpoint === null) return;
    callbackRef.current?.(checkpoint);
  }, []);

  const key = workout === null ? null : checkpointKey(workout);
  const phase = workout?.phase ?? null;

  useEffect(() => {
    if (key === null) return;
    save();
  }, [key, save]);

  useEffect(() => {
    if (phase !== 'exercising' && phase !== 'resting') return;
    const id = setInterval(save, checkpointIntervalMs);
    return () => clearInterval(id);
  }, [phase, save]);

  useEffect(() => {
    if (phase !== 'exercising' && phase !== 'resting' && phase !== 'paused') return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') save();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', save);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', save);
    };
  }, [phase, save]);
}
