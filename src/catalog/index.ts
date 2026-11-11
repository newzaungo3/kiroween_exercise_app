/**
 * The Catalog's public interface. Other modules import the Catalog only
 * through this file.
 *
 * The Catalog imports nothing from React, Three.js, the Viewer or browser
 * storage, and never resolves text: labels are resolved by the UI.
 */
import { exerciseContent } from './exercises';
import type { ExerciseEntry } from './types';

export type {
  CatalogDraft,
  CatalogRule,
  CatalogViolation,
  Difficulty,
  ExerciseDraft,
  ExerciseEntry,
  ExerciseTarget,
  MuscleGroup,
  SameOriginAssetPath,
  StillView,
} from './types';
export { difficulties, muscleGroups, stillViews } from './types';
export { validateCatalog } from './validate';

/** Every Exercise_Entry, in Catalog order. */
export const exercises: readonly ExerciseEntry[] = exerciseContent;

/** The Exercise_Entry with this slug, or undefined if none has it. */
export function findExercise(slug: string): ExerciseEntry | undefined {
  return exercises.find((entry) => entry.slug === slug);
}

/** The slug of every Exercise_Entry, in Catalog order. */
export function exerciseSlugs(): readonly string[] {
  return exercises.map((entry) => entry.slug);
}
