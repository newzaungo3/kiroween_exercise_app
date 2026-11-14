import type { RoutineEntry } from '@/catalog';
import {
  advance,
  autoPause,
  confirmSet,
  pauseWorkout,
  quitWorkout,
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
}

export type RunAction =
  | { readonly type: 'start'; readonly routine: RoutineEntry; readonly now: number }
  | { readonly type: 'tick'; readonly now: number }
  | { readonly type: 'confirm'; readonly now: number; readonly actualReps?: number }
  | { readonly type: 'skipSet'; readonly now: number }
  | { readonly type: 'skipRest'; readonly now: number }
  | { readonly type: 'pause'; readonly now: number }
  | { readonly type: 'autoPause'; readonly now: number }
  | { readonly type: 'resume'; readonly now: number }
  | { readonly type: 'quit'; readonly now: number };

export const initialRunState: RunState = { workout: null, notice: null };

/** Apply a command that sets `notice` only when the engine accepted it. */
function withNotice(
  state: RunState,
  workout: Workout,
  next: Workout,
  notice: RunNotice,
): RunState {
  return next === workout ? state : { workout: next, notice };
}

/** Pure: start only from null; every other action is ignored while null. */
export function runReducer(state: RunState, action: RunAction): RunState {
  const { workout } = state;
  if (action.type === 'start') {
    if (workout !== null) return state;
    return { workout: startWorkout(action.routine, action.now), notice: null };
  }
  if (workout === null) return state;
  switch (action.type) {
    case 'tick':
      return { workout: advance(workout, action.now), notice: state.notice };
    case 'confirm':
      return { workout: confirmSet(workout, action.now, action.actualReps), notice: null };
    case 'skipSet':
      return withNotice(state, workout, skipSet(workout, action.now), 'skippedSet');
    case 'skipRest':
      return withNotice(state, workout, skipRest(workout, action.now), 'skippedRest');
    case 'resume':
      return withNotice(state, workout, resumeWorkout(workout, action.now), 'resumed');
    case 'pause':
      return { workout: pauseWorkout(workout, action.now), notice: null };
    case 'autoPause':
      return { workout: autoPause(workout, action.now), notice: null };
    case 'quit':
      return { workout: quitWorkout(workout, action.now), notice: null };
  }
}
