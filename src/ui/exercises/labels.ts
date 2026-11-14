/**
 * Labels and routes for Exercises, resolved from the Strings_Module.
 *
 * The Catalog holds only string identifiers; this module turns them into
 * text. The Difficulty and Muscle_Group identifiers are built as template
 * literals, so a Difficulty or Muscle_Group without its label string fails
 * the Type_Check.
 */
import type { Difficulty, ExerciseEntry, Kind, MuscleGroup } from '@/catalog';

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

/** The route that serves the entry's Exercise_Detail_Screen, by Kind. */
export function exercisePath(
  exercise: ExerciseEntry,
): `/exercises/${string}` | `/stretches/${string}` {
  return exercise.kind === 'stretch'
    ? `/stretches/${exercise.slug}`
    : `/exercises/${exercise.slug}`;
}

/** The route of the list screen of a Kind. */
export function listPath(kind: Kind): '/exercises' | '/stretches' {
  return kind === 'stretch' ? '/stretches' : '/exercises';
}

/** The Section whose list screen shows the entries of a Kind. */
export function listSection(kind: Kind): 'exercises' | 'stretches' {
  return kind === 'stretch' ? 'stretches' : 'exercises';
}

/** The text of the back link from a detail screen to its list. */
export function backToListLabel(kind: Kind): string {
  return t(kind === 'stretch' ? 'exercise.backToStretches' : 'exercise.backToList');
}

/** The target fact of an entry: reps for rep targets, seconds for held ones. */
export function targetFact(exercise: ExerciseEntry): { readonly label: string; readonly value: string } {
  const { target } = exercise;
  if (target.reps !== undefined) {
    return { label: t('exercise.facts.targetReps'), value: String(target.reps) };
  }
  return { label: t('exercise.facts.targetSeconds'), value: String(target.seconds) };
}
