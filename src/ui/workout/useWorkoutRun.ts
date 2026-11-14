'use client';

import { useCallback, useEffect, useMemo, useReducer } from 'react';

import type { RoutineEntry } from '@/catalog';
import { workoutView } from '@/workout-engine';
import type { SetSlot, WorkoutCheckpoint, WorkoutView } from '@/workout-engine';

import { initialRunState, runReducer } from './run';
import type { RunNotice } from './run';
import { useCheckpointing } from './useCheckpointing';
import { useOnPageHidden } from './usePageHidden';

/** How often the Workout_Clock is fed to the engine while a Set or Rest runs. */
const tickMs = 250;

export interface WorkoutRun {
  readonly view: WorkoutView | null;
  /** The Workout's Sets in order; empty before the start. */
  readonly slots: readonly SetSlot[];
  start(): void;
  readonly notice: RunNotice | null;
  confirm(actualReps?: number): void;
  skipSet(): void;
  skipRest(): void;
  pause(): void;
  resume(): void;
  quit(): void;
  /** True from mount until the restore of the `resume` checkpoint ran. */
  readonly restoring: boolean;
}

export interface WorkoutRunOptions {
  /** A checkpoint to restore on mount, paused. */
  readonly resume?: WorkoutCheckpoint;
  /** Called with the checkpoint on each Checkpoint_Moment, interval save and flush. */
  readonly onCheckpoint?: (checkpoint: WorkoutCheckpoint) => void;
}

/**
 * Client island over the pure engine. `performance.now()` is read only here,
 * inside handlers and the tick. Nothing is written to browser storage.
 */
export function useWorkoutRun(routine: RoutineEntry, options?: WorkoutRunOptions): WorkoutRun {
  const [state, dispatch] = useReducer(runReducer, initialRunState);
  const resumeFrom = options?.resume;

  useEffect(() => {
    if (resumeFrom === undefined) return;
    dispatch({ type: 'restore', checkpoint: resumeFrom, routine, now: performance.now() });
    // Restore once on mount; the reducer ignores a second restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useCheckpointing(state.workout, options?.onCheckpoint);

  const view = useMemo(
    () => (state.workout === null ? null : workoutView(state.workout)),
    [state.workout],
  );
  const phase = view?.phase ?? null;

  const start = useCallback(() => {
    dispatch({ type: 'start', routine, now: performance.now() });
  }, [routine]);

  const confirm = useCallback((actualReps?: number) => {
    dispatch({ type: 'confirm', now: performance.now(), actualReps });
  }, []);

  const skipSet = useCallback(() => {
    dispatch({ type: 'skipSet', now: performance.now() });
  }, []);
  const skipRest = useCallback(() => {
    dispatch({ type: 'skipRest', now: performance.now() });
  }, []);
  const pause = useCallback(() => {
    dispatch({ type: 'pause', now: performance.now() });
  }, []);
  const resume = useCallback(() => {
    dispatch({ type: 'resume', now: performance.now() });
  }, []);
  const quit = useCallback(() => {
    dispatch({ type: 'quit', now: performance.now() });
  }, []);

  const onHidden = useCallback(() => {
    dispatch({ type: 'autoPause', now: performance.now() });
  }, []);
  useOnPageHidden(onHidden, phase === 'exercising' || phase === 'resting');

  useEffect(() => {
    if (phase !== 'exercising' && phase !== 'resting') return;
    const id = setInterval(() => {
      dispatch({ type: 'tick', now: performance.now() });
    }, tickMs);
    return () => clearInterval(id);
  }, [phase]);

  return {
    view,
    slots: state.workout?.slots ?? [],
    notice: state.notice,
    start,
    confirm,
    skipSet,
    skipRest,
    pause,
    resume,
    quit,
    restoring: resumeFrom !== undefined && !state.restoreTried,
  };
}
