import type { RoutineEntry } from '@/catalog';
import { advance, confirmSet, startWorkout } from '@/workout-engine';
import type { Workout } from '@/workout-engine';

/** The Workout_Screen's run state. `workout` is null while the Preparing_Panel shows. */
export interface RunState {
  readonly workout: Workout | null;
}

export type RunAction =
  | { readonly type: 'start'; readonly routine: RoutineEntry; readonly now: number }
  | { readonly type: 'tick'; readonly now: number }
  | { readonly type: 'confirm'; readonly now: number; readonly actualReps?: number };

export const initialRunState: RunState = { workout: null };

/** Pure: start only from null; tick and confirm are ignored while null. */
export function runReducer(state: RunState, action: RunAction): RunState {
  const { workout } = state;
  switch (action.type) {
    case 'start':
      if (workout !== null) return state;
      return { workout: startWorkout(action.routine, action.now) };
    case 'tick':
      if (workout === null) return state;
      return { workout: advance(workout, action.now) };
    case 'confirm':
      if (workout === null) return state;
      return { workout: confirmSet(workout, action.now, action.actualReps) };
  }
}
