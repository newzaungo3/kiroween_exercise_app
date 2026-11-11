/**
 * Labels and routes for Exercises, resolved from the Strings_Module.
 *
 * The Catalog holds only string identifiers; this module turns them into
 * text. The Difficulty and Muscle_Group identifiers are built as template
 * literals, so a Difficulty or Muscle_Group without its label string fails
 * the Type_Check.
 */
import type { Difficulty, ExerciseEntry, MuscleGroup } from '@/catalog';

import { format, t } from '../strings';

/** The label of a Difficulty, for example "Beginner". */
export function difficultyLabel(difficulty: Difficulty): string {
  return t(`difficulty.${difficulty}.name`);
}

/** The label of a Muscle_Group, for example "Quads". */
export function muscleGroupLabel(muscleGroup: MuscleGroup): string {
  return t(`muscleGroup.${muscleGroup}.name`);
}

/** The Exercise's Spooky_Name, for example "Grave Rise". */
export function exerciseName(exercise: ExerciseEntry): string {
  return t(exercise.nameId);
}

/** The document title of the Exercise's Exercise_Detail_Screen. */
export function exerciseTitle(exercise: ExerciseEntry): string {
  return format('exercise.title', { exercise: exerciseName(exercise) });
}

/** The route that serves the Exercise's Exercise_Detail_Screen. */
export function exercisePath(exercise: ExerciseEntry): `/exercises/${string}` {
  return `/exercises/${exercise.slug}`;
}
