'use client';

import { useCallback, useEffect, useMemo, useReducer } from 'react';

import type { RoutineEntry } from '@/catalog';
import { workoutView } from '@/workout-engine';
import type { WorkoutView } from '@/workout-engine';

import { initialRunState, runReducer } from './run';

/** How often the Workout_Clock is fed to the engine while a Set or Rest runs. */
const tickMs = 250;

export interface WorkoutRun {
  readonly view: WorkoutView | null;
  start(): void;
  confirm(actualReps?: number): void;
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

  useEffect(() => {
    if (phase !== 'exercising' && phase !== 'resting') return;
    const id = setInterval(() => {
      dispatch({ type: 'tick', now: performance.now() });
    }, tickMs);
    return () => clearInterval(id);
  }, [phase]);

  return { view, start, confirm };
}
