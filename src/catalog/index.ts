/**
 * The Catalog's public interface. Other modules import the Catalog only
 * through this file.
 *
 * The Catalog imports nothing from React, Three.js, the Viewer or browser
 * storage, and never resolves text: labels are resolved by the UI.
 */
import { exerciseContent } from './exercises';
import { partitionByKind } from './lists';
import { routineContent } from './routines';
import type {
  CatalogContent,
  EntryOfKind,
  ExerciseEntry,
  Kind,
  RoutineEntry,
} from './types';

export type {
  CatalogContent,
  CatalogDraft,
  CatalogRule,
  CatalogViolation,
  Difficulty,
  EntryOfKind,
  ExerciseDraft,
  ExerciseEntry,
  ExerciseTarget,
  Kind,
  MuscleGroup,
  RoutineDraft,
  RoutineEntry,
  RoutineStep,
  RoutineStepDraft,
  SameOriginAssetPath,
  StillView,
  StretchTarget,
} from './types';
export { difficulties, kinds, muscleGroups, stillViews } from './types';
export { validateCatalog } from './validate';
export { neighbours, partitionByKind } from './lists';
export { routineMinutes, routineSeconds, secondsPerRep } from './length';

/** Every Exercise_Entry of both Kinds, in Catalog order. */
export const entries: readonly ExerciseEntry[] = exerciseContent;

/** Every Routine_Entry, in Catalog order. */
export const routines: readonly RoutineEntry[] = routineContent;

/** All Catalog content: the one value the shipped-content test validates. */
export const catalogContent: CatalogContent = { entries, routines };

function isKind<K extends Kind>(
  kind: K,
): (entry: ExerciseEntry) => entry is EntryOfKind<K> {
  return (entry): entry is EntryOfKind<K> => entry.kind === kind;
}

const partitioned = partitionByKind(entries);

/** Every entry of Kind `exercise`, in Catalog order. */
export const exercises: readonly EntryOfKind<'exercise'>[] =
  partitioned.exercises.filter(isKind('exercise'));

/** Every entry of Kind `stretch`, in Catalog order. */
export const stretches: readonly EntryOfKind<'stretch'>[] =
  partitioned.stretches.filter(isKind('stretch'));

/** The entries of one Kind, in Catalog order. */
export function entriesOfKind<K extends Kind>(
  kind: K,
): readonly EntryOfKind<K>[] {
  return entries.filter(isKind(kind));
}

/** The entry of this Kind with this slug, or undefined if none has it. */
export function findEntry<K extends Kind>(
  kind: K,
  slug: string,
): EntryOfKind<K> | undefined {
  return entriesOfKind(kind).find((entry) => entry.slug === slug);
}

/** The entry of Kind `exercise` with this slug, or undefined. */
export function findExercise(slug: string): EntryOfKind<'exercise'> | undefined {
  return findEntry('exercise', slug);
}

/** The entry of Kind `stretch` with this slug, or undefined. */
export function findStretch(slug: string): EntryOfKind<'stretch'> | undefined {
  return findEntry('stretch', slug);
}

/** The slug of every entry of Kind `exercise`, in Catalog order. */
export function exerciseSlugs(): readonly string[] {
  return exercises.map((entry) => entry.slug);
}

/** The slug of every entry of Kind `stretch`, in Catalog order. */
export function stretchSlugs(): readonly string[] {
  return stretches.map((entry) => entry.slug);
}

/** The entry with this id, of either Kind, or undefined. */
export function findEntryById(id: string): ExerciseEntry | undefined {
  return entries.find((entry) => entry.id === id);
}

/** The Routine_Entry with this slug, or undefined if none has it. */
export function findRoutine(slug: string): RoutineEntry | undefined {
  return routines.find((routine) => routine.slug === slug);
}
