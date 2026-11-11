/**
 * Catalog types: static, typed, read-only content for Exercises.
 *
 * The Catalog imports nothing from React, Three.js, the Viewer or browser
 * storage. Its only outside reference is the type `StringId`, so every
 * user-facing text of an Exercise_Entry is a Strings_Module identifier and an
 * undefined identifier fails the Type_Check.
 */
import type { StringId } from '@/ui/strings';

/** The three Difficulty levels, easiest first. */
export const difficulties = ['beginner', 'intermediate', 'advanced'] as const;
export type Difficulty = (typeof difficulties)[number];

/** The body areas an Exercise mainly works. Ticket 05 extends the list. */
export const muscleGroups = ['quads', 'glutes', 'core'] as const;
export type MuscleGroup = (typeof muscleGroups)[number];

/** The directions a Still_Image is rendered from, matching the Camera_Presets. */
export const stillViews = ['front', 'side', 'back'] as const;
export type StillView = (typeof stillViews)[number];

/** A same-origin path under /assets/. */
export type SameOriginAssetPath = `/assets/${string}`;

/** The target of an Exercise: reps or seconds, never both. */
export type ExerciseTarget =
  | { readonly reps: number; readonly seconds?: never }
  | { readonly seconds: number; readonly reps?: never };

/** The Catalog record of one Exercise. Every field and list is read-only. */
export interface ExerciseEntry {
  /** Stable identifier, e.g. 'grave-rise'. */
  readonly id: string;
  /** URL segment of the Exercise_Detail_Screen, e.g. 'grave-rise'. */
  readonly slug: string;
  /** Spooky_Name. */
  readonly nameId: StringId;
  /** Real_Name. */
  readonly realNameId: StringId;
  readonly difficulty: Difficulty;
  readonly muscleGroups: readonly MuscleGroup[];
  readonly target: ExerciseTarget;
  /** Instruction_Steps, 3 to 5, in order. */
  readonly stepIds: readonly StringId[];
  /** Cues. */
  readonly cueIds: readonly StringId[];
  /** Safety_Notes. */
  readonly safetyNoteIds: readonly StringId[];
  /** Coach_Asset path and the name of its Demo_Clip. */
  readonly coach: {
    readonly asset: SameOriginAssetPath;
    readonly demoClip: string;
  };
  /** Front, side and back Still_Image paths. */
  readonly stills: { readonly [V in StillView]: SameOriginAssetPath };
}

/**
 * Loose shape of one Exercise_Entry accepted by the Catalog validation
 * function, so tests can describe broken content without casts. Every
 * ExerciseEntry is assignable to it.
 */
export interface ExerciseDraft {
  readonly id?: string;
  readonly slug?: string;
  readonly nameId?: string;
  readonly realNameId?: string;
  readonly difficulty?: string;
  readonly muscleGroups?: readonly string[];
  readonly target?: { readonly reps?: number; readonly seconds?: number };
  readonly stepIds?: readonly string[];
  readonly cueIds?: readonly string[];
  readonly safetyNoteIds?: readonly string[];
  readonly coach?: { readonly asset?: string; readonly demoClip?: string };
  readonly stills?: {
    readonly front?: string;
    readonly side?: string;
    readonly back?: string;
  };
}

/** Loose shape of Catalog content accepted by the Catalog validation function. */
export interface CatalogDraft {
  readonly exercises: readonly ExerciseDraft[];
}

/** A rule of the Catalog validation function. */
export type CatalogRule =
  | 'id-missing'
  | 'id-duplicate'
  | 'slug-duplicate'
  | 'slug-format'
  | 'target-kind'
  | 'target-value'
  | 'difficulty-unknown'
  | 'step-count'
  | 'muscle-group-missing'
  | 'cue-missing'
  | 'safety-note-missing'
  | 'coach-asset-missing'
  | 'coach-asset-path'
  | 'demo-clip-missing'
  | 'still-image-missing'
  | 'still-image-path';

/**
 * One broken rule of one Exercise_Entry. `exerciseId` is `#<index>` when the
 * Exercise_Entry has no identifier.
 */
export interface CatalogViolation {
  readonly exerciseId: string;
  readonly rule: CatalogRule;
}
