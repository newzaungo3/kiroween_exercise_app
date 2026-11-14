/**
 * Labels and routes for Routines, resolved from the Strings_Module.
 *
 * The Catalog holds only string identifiers and numbers; this module turns
 * them into text and routes.
 */
import {
  findEntryById,
  routineMinutes,
  type ExerciseEntry,
  type RoutineEntry,
  type RoutineStep,
} from '@/catalog';

import { format, t } from '../strings';

/** The Routine's Spooky_Name, for example "Graveyard Shift". */
export function routineName(routine: RoutineEntry): string {
  return t(routine.nameId);
}

/** The route of the Routine's detail screen. */
export function routinePath(routine: RoutineEntry): `/routines/${string}` {
  return `/routines/${routine.slug}`;
}

/** The route of the Routine's Workout screen. */
export function workoutPath(routine: RoutineEntry): `/routines/${string}/workout` {
  return `/routines/${routine.slug}/workout`;
}

/** The estimated length, for example "About 10 minutes". */
export function lengthLabel(routine: RoutineEntry): string {
  const minutes = routineMinutes(routine);
  return format(minutes === 1 ? 'routine.length.one' : 'routine.length.other', {
    minutes: String(minutes),
  });
}

/** A count of Exercises or Stretches, for example "3 Exercises". */
export function countLabel(kind: 'exercises' | 'stretches', count: number): string {
  const values = { count: String(count) };
  if (kind === 'exercises') {
    return format(
      count === 1 ? 'routine.count.exercises.one' : 'routine.count.exercises.other',
      values,
    );
  }
  return format(
    count === 1 ? 'routine.count.stretches.one' : 'routine.count.stretches.other',
    values,
  );
}

/** A count of Sets, for example "3 Sets". */
export function setsLabel(count: number): string {
  return format(count === 1 ? 'routine.sets.one' : 'routine.sets.other', {
    count: String(count),
  });
}

/** The target of a step, for example "10 reps" or "30 seconds". */
export function stepTargetLabel(step: RoutineStep): string {
  const { target } = step;
  if (target.reps !== undefined) {
    return format('routine.target.reps', { reps: String(target.reps) });
  }
  return format('routine.target.seconds', { seconds: String(target.seconds) });
}

/** One summary line of a step, for example "3 Sets · 10 reps · Rest 30 seconds". */
export function stepLine(step: RoutineStep): string {
  return [
    setsLabel(step.sets),
    stepTargetLabel(step),
    format('routine.rest', { seconds: String(step.restSeconds) }),
  ].join(' · ');
}

/** The Exercise_Entry a step refers to. Throws if the Catalog lacks it. */
export function entryOfStep(step: RoutineStep): ExerciseEntry {
  const entry = findEntryById(step.entryId);
  if (entry === undefined) {
    throw new Error(`Routine step refers to unknown entry "${step.entryId}"`);
  }
  return entry;
}
