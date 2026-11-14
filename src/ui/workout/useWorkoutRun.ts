'use client';

import { useCallback, useEffect, useMemo, useReducer } from 'react';

import type { RoutineEntry } from '@/catalog';
import { workoutView } from '@/workout-engine';
import type { SetSlot, WorkoutView } from '@/workout-engine';

import { initialRunState, runReducer } from './run';
import type { RunNotice } from './run';
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
}

/**
 * Client island over the pure engine. `performance.now()` is read only here,
 * inside handlers and the tick. Nothing is written to browser storage.
 */
export function useWorkoutRun(routine: RoutineEntry): WorkoutRun {
  const [state, dispatch] = useReducer(runReducer, initialRunState);

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
  };
}
