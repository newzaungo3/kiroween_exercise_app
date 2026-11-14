import type { RoutineEntry } from '@/catalog';
import {
  advance,
  autoPause,
  confirmSet,
  pauseWorkout,
  quitWorkout,
  restoreWorkout,
  resumeWorkout,
  skipRest,
  skipSet,
  startWorkout,
} from '@/workout-engine';
import type { Workout } from '@/workout-engine';

/** A one-shot note for the live region, set by an accepted skip or resume. */
export type RunNotice = 'skippedSet' | 'skippedRest' | 'resumed';

/** The Workout_Screen's run state. `workout` is null while the Preparing_Panel shows. */
export interface RunState {
  readonly workout: Workout | null;
  readonly notice: RunNotice | null;
  /** True once a restore action ran, whether or not it produced a Workout. */
  readonly restoreTried: boolean;
}

export type RunAction =
  | { readonly type: 'start'; readonly routine: RoutineEntry; readonly now: number }
  | {
      readonly type: 'restore';
      readonly checkpoint: unknown;
      readonly routine: RoutineEntry;
      readonly now: number;
    }
  | { readonly type: 'tick'; readonly now: number }
  | { readonly type: 'confirm'; readonly now: number; readonly actualReps?: number }
  | { readonly type: 'skipSet'; readonly now: number }
  | { readonly type: 'skipRest'; readonly now: number }
  | { readonly type: 'pause'; readonly now: number }
  | { readonly type: 'autoPause'; readonly now: number }
  | { readonly type: 'resume'; readonly now: number }
  | { readonly type: 'quit'; readonly now: number };

export const initialRunState: RunState = { workout: null, notice: null, restoreTried: false };

/** Apply a command that sets `notice` only when the engine accepted it. */
function withNotice(
  state: RunState,
  workout: Workout,
  next: Workout,
  notice: RunNotice,
): RunState {
  return next === workout ? state : { ...state, workout: next, notice };
}

/** Pure: start and restore only from null; every other action is ignored while null. */
export function runReducer(state: RunState, action: RunAction): RunState {
  const { workout } = state;
  if (action.type === 'start') {
    if (workout !== null) return state;
    return { ...state, workout: startWorkout(action.routine, action.now), notice: null };
  }
  if (action.type === 'restore') {
    if (workout !== null) return state;
    return {
      workout: restoreWorkout(action.checkpoint, action.routine, action.now),
      notice: null,
      restoreTried: true,
    };
  }
  if (workout === null) return state;
  switch (action.type) {
    case 'tick':
      return { ...state, workout: advance(workout, action.now) };
    case 'confirm':
      return { ...state, workout: confirmSet(workout, action.now, action.actualReps), notice: null };
    case 'skipSet':
      return withNotice(state, workout, skipSet(workout, action.now), 'skippedSet');
    case 'skipRest':
      return withNotice(state, workout, skipRest(workout, action.now), 'skippedRest');
    case 'resume':
      return withNotice(state, workout, resumeWorkout(workout, action.now), 'resumed');
    case 'pause':
      return { ...state, workout: pauseWorkout(workout, action.now), notice: null };
    case 'autoPause':
      return { ...state, workout: autoPause(workout, action.now), notice: null };
    case 'quit':
      return { ...state, workout: quitWorkout(workout, action.now), notice: null };
  }
}
