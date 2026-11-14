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

/** The two Kinds of Catalog entry. A Stretch is an Exercise held for seconds. */
export const kinds = ['exercise', 'stretch'] as const;
export type Kind = (typeof kinds)[number];

/** The body areas an Exercise mainly works. */
export const muscleGroups = [
  'quads',
  'glutes',
  'core',
  'shoulders',
  'calves',
  'chest',
  'triceps',
  'obliques',
  'hamstrings',
  'back',
] as const;
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

/** The target of a Stretch: seconds only. */
export type StretchTarget = {
  readonly seconds: number;
  readonly reps?: never;
};

/** The fields every Catalog entry shares, whatever its Kind. */
interface EntryFields {
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
 * The Catalog record of one Exercise or Stretch, discriminated by `kind`.
 * A `stretch` with a reps target fails the Type_Check. Every field and list
 * is read-only.
 */
export type ExerciseEntry =
  | (EntryFields & {
      readonly kind: 'exercise';
      readonly target: ExerciseTarget;
    })
  | (EntryFields & {
      readonly kind: 'stretch';
      readonly target: StretchTarget;
    });

/** The entries of one Kind. */
export type EntryOfKind<K extends Kind> = Extract<
  ExerciseEntry,
  { readonly kind: K }
>;

/** One step of a Routine: an Exercise or Stretch with Sets, target and Rest. */
export interface RoutineStep {
  /** Identifier of the Exercise_Entry. */
  readonly entryId: string;
  readonly sets: number;
  readonly target: ExerciseTarget;
  /** Rest after every Set of this step, in whole seconds. */
  readonly restSeconds: number;
}

/** The Catalog record of one Routine. The Cool-down is a separate list. */
export interface RoutineEntry {
  readonly id: string;
  readonly slug: string;
  readonly nameId: StringId;
  readonly steps: readonly RoutineStep[];
  readonly coolDown: readonly RoutineStep[];
}

/** All Catalog content. */
export interface CatalogContent {
  readonly entries: readonly ExerciseEntry[];
  readonly routines: readonly RoutineEntry[];
}

/**
 * Loose shape of one Exercise_Entry accepted by the Catalog validation
 * function, so tests can describe broken content without casts. Every
 * ExerciseEntry is assignable to it.
 */
export interface ExerciseDraft {
  readonly kind?: string;
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

/** Loose shape of one Routine_Step. */
export interface RoutineStepDraft {
  readonly entryId?: string;
  readonly sets?: number;
  readonly target?: { readonly reps?: number; readonly seconds?: number };
  readonly restSeconds?: number;
}

/** Loose shape of one Routine_Entry. */
export interface RoutineDraft {
  readonly id?: string;
  readonly slug?: string;
  readonly nameId?: string;
  readonly steps?: readonly RoutineStepDraft[];
  readonly coolDown?: readonly RoutineStepDraft[];
}

/** Loose shape of Catalog content accepted by the Catalog validation function. */
export interface CatalogDraft {
  readonly entries: readonly ExerciseDraft[];
  readonly routines: readonly RoutineDraft[];
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
  | 'still-image-path'
  | 'kind-unknown'
  | 'stretch-reps'
  | 'routine-id-missing'
  | 'routine-id-duplicate'
  | 'routine-slug-duplicate'
  | 'routine-slug-format'
  | 'routine-name-missing'
  | 'routine-steps-empty'
  | 'routine-cool-down-empty'
  | 'step-entry-unknown'
  | 'step-entry-kind'
  | 'step-sets'
  | 'step-target-kind'
  | 'step-target-value'
  | 'step-target-unit'
  | 'step-rest';

/**
 * One broken rule of one subject: an Exercise_Entry (its id, or `#<index>`),
 * a Routine_Entry (its id, or `routine#<index>`) or a Routine_Step
 * (`<routine>/steps#<i>` or `<routine>/coolDown#<i>`).
 */
export interface CatalogViolation {
  readonly subjectId: string;
  readonly rule: CatalogRule;
}
