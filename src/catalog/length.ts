/**
 * Routine length estimate. Computed from Sets, targets and Rest so it cannot
 * drift from the Routine_Entry. Pure: no React, Three.js or storage imports.
 */
import type { RoutineEntry, RoutineStep } from './types';

/** Assumed seconds per rep when a step targets reps. */
export const secondsPerRep = 3;

function stepSeconds(step: RoutineStep): number {
  const work =
    step.target.reps !== undefined
      ? step.target.reps * secondsPerRep
      : (step.target.seconds ?? 0);
  return step.sets * (work + step.restSeconds);
}

/** Sum over `steps` and `coolDown` of sets × (work + restSeconds). */
export function routineSeconds(routine: RoutineEntry): number {
  return [...routine.steps, ...routine.coolDown].reduce(
    (total, step) => total + stepSeconds(step),
    0,
  );
}

/** The estimate in whole minutes, rounded to the nearest minute. */
export function routineMinutes(routine: RoutineEntry): number {
  return Math.round(routineSeconds(routine) / 60);
}
