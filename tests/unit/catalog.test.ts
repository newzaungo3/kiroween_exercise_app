import fc from 'fast-check';

import { describe, expect, it } from 'vitest';

import {
  catalogContent,
  difficulties,
  entries,
  exerciseSlugs,
  exercises,
  findExercise,
  findStretch,
  muscleGroups,
  stillViews,
  stretches,
  stretchSlugs,
  validateCatalog,
  type CatalogDraft,
  type CatalogRule,
  type CatalogViolation,
  type ExerciseDraft,
  type RoutineDraft,
  type RoutineStepDraft,
  type StillView,
} from '@/catalog';
import { locales, t, type Locale, type StringId } from '@/ui/strings';

// ---------------------------------------------------------------------------
// Fixtures for the per-rule examples
// ---------------------------------------------------------------------------

/** A readable valid Exercise draft with id and slug `id`. */
function validEntry(id: string): ExerciseDraft {
  return {
    kind: 'exercise',
    id,
    slug: id,
    nameId: `exercise.${id}.name`,
    realNameId: `exercise.${id}.realName`,
    difficulty: 'beginner',
    muscleGroups: ['quads'],
    target: { reps: 10 },
    stepIds: ['step1', 'step2', 'step3'],
    cueIds: ['cue1'],
    safetyNoteIds: ['safety1'],
    coach: { asset: `/assets/coach/${id}.glb`, demoClip: 'demo_loop' },
    stills: {
      front: `/assets/coach/stills/${id}_front.png`,
      side: `/assets/coach/stills/${id}_side.png`,
      back: `/assets/coach/stills/${id}_back.png`,
    },
  };
}

/** One concrete broken Catalog per rule and the one violation it must give. */
interface RuleExample {
  readonly rule: CatalogRule;
  readonly description: string;
  readonly entries: readonly ExerciseDraft[];
  readonly routines?: readonly RoutineDraft[];
  readonly violation: CatalogViolation;
}

const base = validEntry('grave-rise');
const other = validEntry('skeleton-jacks');
/** A valid Stretch draft: Kind `stretch` with a seconds target. */
const stretch: ExerciseDraft = {
  ...validEntry('bat-hang'),
  kind: 'stretch',
  target: { seconds: 30 },
};
/** A valid Routine draft over `base` (Exercise) and `stretch` (Cool-down). */
const routine: RoutineDraft = {
  id: 'graveyard-shift',
  slug: 'graveyard-shift',
  nameId: 'routine.graveyardShift.name',
  steps: [{ entryId: 'grave-rise', sets: 2, target: { reps: 10 }, restSeconds: 30 }],
  coolDown: [{ entryId: 'bat-hang', sets: 1, target: { seconds: 30 }, restSeconds: 10 }],
};
const routineStep = routine.steps?.[0];
const coolDownStep = routine.coolDown?.[0];
const baseEntries = [base, stretch];

/** The draft Catalog of one rule example. */
function draftOf(example: RuleExample): CatalogDraft {
  return { entries: example.entries, routines: example.routines ?? [] };
}

const ruleExamples: readonly RuleExample[] = [
  {
    rule: 'id-missing',
    description: 'an Exercise_Entry with an empty identifier is named by its position',
    entries: [other, { ...base, id: '' }],
    violation: { subjectId: '#1', rule: 'id-missing' },
  },
  {
    rule: 'id-duplicate',
    description: 'two Exercise_Entries share an identifier',
    entries: [base, { ...other, id: 'grave-rise' }],
    violation: { subjectId: 'grave-rise', rule: 'id-duplicate' },
  },
  {
    rule: 'slug-duplicate',
    description: 'two Exercise_Entries share a slug',
    entries: [base, { ...other, slug: 'grave-rise' }],
    violation: { subjectId: 'skeleton-jacks', rule: 'slug-duplicate' },
  },
  {
    rule: 'slug-format',
    description: 'a slug with an uppercase letter and a space',
    entries: [{ ...base, slug: 'Grave Rise' }],
    violation: { subjectId: 'grave-rise', rule: 'slug-format' },
  },
  {
    rule: 'target-kind',
    description: 'an Exercise targets both reps and seconds',
    entries: [{ ...base, target: { reps: 10, seconds: 30 } }],
    violation: { subjectId: 'grave-rise', rule: 'target-kind' },
  },
  {
    rule: 'target-value',
    description: 'a target of 0 reps',
    entries: [{ ...base, target: { reps: 0 } }],
    violation: { subjectId: 'grave-rise', rule: 'target-value' },
  },
  {
    rule: 'difficulty-unknown',
    description: 'a Difficulty outside Beginner, Intermediate and Advanced',
    entries: [{ ...base, difficulty: 'expert' }],
    violation: { subjectId: 'grave-rise', rule: 'difficulty-unknown' },
  },
  {
    rule: 'step-count',
    description: 'only two Instruction_Steps',
    entries: [{ ...base, stepIds: ['step1', 'step2'] }],
    violation: { subjectId: 'grave-rise', rule: 'step-count' },
  },
  {
    rule: 'muscle-group-missing',
    description: 'no Muscle_Group',
    entries: [{ ...base, muscleGroups: [] }],
    violation: { subjectId: 'grave-rise', rule: 'muscle-group-missing' },
  },
  {
    rule: 'cue-missing',
    description: 'no Cue',
    entries: [{ ...base, cueIds: [] }],
    violation: { subjectId: 'grave-rise', rule: 'cue-missing' },
  },
  {
    rule: 'safety-note-missing',
    description: 'no Safety_Note',
    entries: [{ ...base, safetyNoteIds: [] }],
    violation: { subjectId: 'grave-rise', rule: 'safety-note-missing' },
  },
  {
    rule: 'coach-asset-missing',
    description: 'an empty Coach_Asset path',
    entries: [{ ...base, coach: { ...base.coach, asset: '' } }],
    violation: { subjectId: 'grave-rise', rule: 'coach-asset-missing' },
  },
  {
    rule: 'coach-asset-path',
    description: 'a Coach_Asset path that climbs out of /assets/',
    entries: [{ ...base, coach: { ...base.coach, asset: '/assets/../secret.glb' } }],
    violation: { subjectId: 'grave-rise', rule: 'coach-asset-path' },
  },
  {
    rule: 'demo-clip-missing',
    description: 'an empty Demo_Clip name',
    entries: [{ ...base, coach: { ...base.coach, demoClip: '' } }],
    violation: { subjectId: 'grave-rise', rule: 'demo-clip-missing' },
  },
  {
    rule: 'still-image-missing',
    description: 'no side Still_Image',
    entries: [{ ...base, stills: { ...base.stills, side: undefined } }],
    violation: { subjectId: 'grave-rise', rule: 'still-image-missing' },
  },
  {
    rule: 'still-image-path',
    description: 'a back Still_Image on another origin',
    entries: [{ ...base, stills: { ...base.stills, back: 'https://example.com/assets/back.png' } }],
    violation: { subjectId: 'grave-rise', rule: 'still-image-path' },
  },
  {
    rule: 'kind-unknown',
    description: 'an Exercise_Entry whose Kind is neither exercise nor stretch',
    entries: [{ ...base, kind: 'monster' }],
    violation: { subjectId: 'grave-rise', rule: 'kind-unknown' },
  },
  {
    rule: 'stretch-reps',
    description: 'a Stretch with a reps target',
    entries: [{ ...stretch, target: { reps: 10 } }],
    violation: { subjectId: 'bat-hang', rule: 'stretch-reps' },
  },
  {
    rule: 'routine-id-missing',
    description: 'a Routine_Entry with an empty identifier is named by its position',
    entries: baseEntries,
    routines: [{ ...routine, id: '' }],
    violation: { subjectId: 'routine#0', rule: 'routine-id-missing' },
  },
  {
    rule: 'routine-id-duplicate',
    description: 'two Routine_Entries share an identifier',
    entries: baseEntries,
    routines: [routine, { ...routine, slug: 'other-shift' }],
    violation: { subjectId: 'graveyard-shift', rule: 'routine-id-duplicate' },
  },
  {
    rule: 'routine-slug-duplicate',
    description: 'two Routine_Entries share a slug',
    entries: baseEntries,
    routines: [routine, { ...routine, id: 'other-shift' }],
    violation: { subjectId: 'other-shift', rule: 'routine-slug-duplicate' },
  },
  {
    rule: 'routine-slug-format',
    description: 'a Routine slug with an uppercase letter and a space',
    entries: baseEntries,
    routines: [{ ...routine, slug: 'Graveyard Shift' }],
    violation: { subjectId: 'graveyard-shift', rule: 'routine-slug-format' },
  },
  {
    rule: 'routine-name-missing',
    description: 'a Routine_Entry with an empty name identifier',
    entries: baseEntries,
    routines: [{ ...routine, nameId: '' }],
    violation: { subjectId: 'graveyard-shift', rule: 'routine-name-missing' },
  },
  {
    rule: 'routine-steps-empty',
    description: 'a Routine_Entry with no Routine_Steps',
    entries: baseEntries,
    routines: [{ ...routine, steps: [] }],
    violation: { subjectId: 'graveyard-shift', rule: 'routine-steps-empty' },
  },
  {
    rule: 'routine-cool-down-empty',
    description: 'a Routine_Entry with no Cool-down',
    entries: baseEntries,
    routines: [{ ...routine, coolDown: [] }],
    violation: { subjectId: 'graveyard-shift', rule: 'routine-cool-down-empty' },
  },
  {
    rule: 'step-entry-unknown',
    description: 'a Routine_Step naming an identifier no Exercise_Entry has',
    entries: baseEntries,
    routines: [{ ...routine, steps: [{ ...routineStep, entryId: 'no-such-entry' }] }],
    violation: { subjectId: 'graveyard-shift/steps#0', rule: 'step-entry-unknown' },
  },
  {
    rule: 'step-entry-kind',
    description: 'an Exercise in the Cool-down',
    entries: baseEntries,
    routines: [
      { ...routine, coolDown: [{ ...coolDownStep, entryId: 'grave-rise', target: { reps: 10 } }] },
    ],
    violation: { subjectId: 'graveyard-shift/coolDown#0', rule: 'step-entry-kind' },
  },
  {
    rule: 'step-sets',
    description: 'a Routine_Step with 0 Sets',
    entries: baseEntries,
    routines: [{ ...routine, steps: [{ ...routineStep, sets: 0 }] }],
    violation: { subjectId: 'graveyard-shift/steps#0', rule: 'step-sets' },
  },
  {
    rule: 'step-target-kind',
    description: 'a Routine_Step targeting both reps and seconds',
    entries: baseEntries,
    routines: [{ ...routine, steps: [{ ...routineStep, target: { reps: 10, seconds: 30 } }] }],
    violation: { subjectId: 'graveyard-shift/steps#0', rule: 'step-target-kind' },
  },
  {
    rule: 'step-target-value',
    description: 'a Routine_Step with a target of 0 reps',
    entries: baseEntries,
    routines: [{ ...routine, steps: [{ ...routineStep, target: { reps: 0 } }] }],
    violation: { subjectId: 'graveyard-shift/steps#0', rule: 'step-target-value' },
  },
  {
    rule: 'step-target-unit',
    description: 'a Routine_Step with a seconds target for an Exercise with a reps target',
    entries: baseEntries,
    routines: [{ ...routine, steps: [{ ...routineStep, target: { seconds: 30 } }] }],
    violation: { subjectId: 'graveyard-shift/steps#0', rule: 'step-target-unit' },
  },
  {
    rule: 'step-rest',
    description: 'a Routine_Step with a Rest of 601 seconds',
    entries: baseEntries,
    routines: [{ ...routine, steps: [{ ...routineStep, restSeconds: 601 }] }],
    violation: { subjectId: 'graveyard-shift/steps#0', rule: 'step-rest' },
  },
];

/**
 * Every Catalog rule. A mapped type over `CatalogRule`, so adding a rule
 * without listing it here fails the Type_Check, and the examples above
 * cannot silently miss one.
 */
const everyRule: { readonly [R in CatalogRule]: true } = {
  'id-missing': true,
  'id-duplicate': true,
  'slug-duplicate': true,
  'slug-format': true,
  'target-kind': true,
  'target-value': true,
  'difficulty-unknown': true,
  'step-count': true,
  'muscle-group-missing': true,
  'cue-missing': true,
  'safety-note-missing': true,
  'coach-asset-missing': true,
  'coach-asset-path': true,
  'demo-clip-missing': true,
  'still-image-missing': true,
  'still-image-path': true,
  'kind-unknown': true,
  'stretch-reps': true,
  'routine-id-missing': true,
  'routine-id-duplicate': true,
  'routine-slug-duplicate': true,
  'routine-slug-format': true,
  'routine-name-missing': true,
  'routine-steps-empty': true,
  'routine-cool-down-empty': true,
  'step-entry-unknown': true,
  'step-entry-kind': true,
  'step-sets': true,
  'step-target-kind': true,
  'step-target-value': true,
  'step-target-unit': true,
  'step-rest': true,
};
const allRules = Object.keys(everyRule) as CatalogRule[]; // keys of a value typed by CatalogRule

// ---------------------------------------------------------------------------
// Generators for Property 1
// ---------------------------------------------------------------------------

/**
 * A valid entry draft of `kind` at position `index`: id and slug `e-<index>`.
 * A Stretch targets seconds; an Exercise targets reps or seconds.
 */
function validDraft(index: number, kind: 'exercise' | 'stretch'): fc.Arbitrary<ExerciseDraft> {
  const ids = (name: string, count: number): string[] =>
    Array.from({ length: count }, (_, k) => `exercise.e${index}.${name}${k + 1}`);
  const seconds = fc.integer({ min: 1, max: 200 }).map((value) => ({ seconds: value }));
  return fc
    .record({
      target:
        kind === 'stretch'
          ? seconds
          : fc.oneof(fc.integer({ min: 1, max: 200 }).map((reps) => ({ reps })), seconds),
      difficulty: fc.constantFrom(...difficulties),
      steps: fc.integer({ min: 3, max: 5 }),
      muscles: fc.subarray([...muscleGroups], { minLength: 1, maxLength: 3 }),
      cues: fc.integer({ min: 1, max: 3 }),
      notes: fc.integer({ min: 1, max: 3 }),
    })
    .map(({ target, difficulty, steps, muscles, cues, notes }) => ({
      kind,
      id: `e-${index}`,
      slug: `e-${index}`,
      nameId: `exercise.e${index}.name`,
      realNameId: `exercise.e${index}.realName`,
      difficulty,
      muscleGroups: muscles,
      target,
      stepIds: ids('step', steps),
      cueIds: ids('cue', cues),
      safetyNoteIds: ids('safety', notes),
      coach: { asset: `/assets/x/${index}.glb`, demoClip: 'demo_loop' },
      stills: {
        front: `/assets/x/${index}-front.png`,
        side: `/assets/x/${index}-side.png`,
        back: `/assets/x/${index}-back.png`,
      },
    }));
}

/** One mutation that breaks exactly one Catalog rule. Plain data, so fast-check prints it. */
type Breakage =
  | { readonly rule: 'id-missing'; readonly id: '' | undefined }
  | { readonly rule: 'id-duplicate'; readonly pick: number }
  | { readonly rule: 'slug-duplicate'; readonly pick: number }
  | { readonly rule: 'slug-format'; readonly slug: 'empty' | 'absent' | 'upper' | 'space' | 'underscore' | 'dot' }
  | { readonly rule: 'target-kind'; readonly target: 'both' | 'neither' | 'absent' }
  | { readonly rule: 'target-value'; readonly kind: 'reps' | 'seconds'; readonly value: number }
  | { readonly rule: 'difficulty-unknown'; readonly difficulty: string | undefined }
  | { readonly rule: 'step-count'; readonly count: number | undefined }
  | {
      readonly rule: 'muscle-group-missing' | 'cue-missing' | 'safety-note-missing';
      readonly list: 'empty' | 'absent';
    }
  | { readonly rule: 'coach-asset-missing'; readonly asset: '' | undefined }
  | { readonly rule: 'coach-asset-path'; readonly asset: string }
  | { readonly rule: 'demo-clip-missing'; readonly demoClip: '' | undefined }
  | { readonly rule: 'still-image-missing'; readonly view: StillView; readonly path: '' | undefined }
  | { readonly rule: 'still-image-path'; readonly view: StillView; readonly path: string }
  | { readonly rule: 'kind-unknown'; readonly kind: string | undefined }
  | { readonly rule: 'stretch-reps'; readonly reps: number };

/** One mutation that breaks exactly one Routine_Entry rule. */
type RoutineBreakage =
  | { readonly rule: 'routine-id-missing'; readonly id: '' | undefined }
  | { readonly rule: 'routine-id-duplicate'; readonly pick: number }
  | { readonly rule: 'routine-slug-duplicate'; readonly pick: number }
  | { readonly rule: 'routine-slug-format'; readonly slug: 'empty' | 'absent' | 'upper' | 'space' }
  | { readonly rule: 'routine-name-missing'; readonly nameId: '' | undefined }
  | { readonly rule: 'routine-steps-empty'; readonly list: 'empty' | 'absent' }
  | { readonly rule: 'routine-cool-down-empty'; readonly list: 'empty' | 'absent' };

/** One mutation that breaks exactly one Routine_Step rule. */
type StepBreakage =
  | { readonly rule: 'step-entry-unknown'; readonly entryId: 'no-such-entry' | '' | undefined }
  | { readonly rule: 'step-entry-kind' }
  | { readonly rule: 'step-sets'; readonly sets: number | undefined }
  | { readonly rule: 'step-target-kind'; readonly target: 'both' | 'neither' | 'absent' }
  | { readonly rule: 'step-target-value'; readonly value: number }
  | { readonly rule: 'step-target-unit' }
  | { readonly rule: 'step-rest'; readonly restSeconds: number | undefined };

/** Paths that are non-empty but not safe same-origin paths under /assets/. */
const badAssetPaths = [
  '/public/x.glb',
  'assets/x.glb',
  '/assets/',
  '/assets/../secret.glb',
  '/assets/x/../y.glb',
  '/assets//x.glb',
  '/assets/a b.glb',
  '/assets/x?.glb',
  '/assets/ü.glb',
  'https://example.com/assets/x.glb',
] as const;

const blank = fc.constantFrom<'' | undefined>('', undefined);
const list = fc.constantFrom<'empty' | 'absent'>('empty', 'absent');
const view = fc.constantFrom(...stillViews);

const breakage: fc.Arbitrary<Breakage> = fc.oneof(
  fc.record({ rule: fc.constant('id-missing' as const), id: blank }),
  fc.record({ rule: fc.constant('id-duplicate' as const), pick: fc.nat() }),
  fc.record({ rule: fc.constant('slug-duplicate' as const), pick: fc.nat() }),
  fc.record({
    rule: fc.constant('slug-format' as const),
    slug: fc.constantFrom('empty', 'absent', 'upper', 'space', 'underscore', 'dot'),
  }),
  fc.record({
    rule: fc.constant('target-kind' as const),
    target: fc.constantFrom('both', 'neither', 'absent'),
  }),
  fc.record({
    rule: fc.constant('target-value' as const),
    kind: fc.constantFrom('reps', 'seconds'),
    value: fc.oneof(
      fc.constantFrom(0, -0, -3, 2.5, 0.1, Number.NaN, Number.POSITIVE_INFINITY),
      fc.integer({ min: -500, max: 0 }),
    ),
  }),
  fc.record({
    rule: fc.constant('difficulty-unknown' as const),
    difficulty: fc.constantFrom('expert', 'Beginner', '', undefined),
  }),
  fc.record({
    rule: fc.constant('step-count' as const),
    count: fc.constantFrom(0, 1, 2, 6, 7, 10, undefined),
  }),
  fc.record({
    rule: fc.constantFrom('muscle-group-missing' as const, 'cue-missing' as const, 'safety-note-missing' as const),
    list,
  }),
  fc.record({ rule: fc.constant('coach-asset-missing' as const), asset: blank }),
  fc.record({ rule: fc.constant('coach-asset-path' as const), asset: fc.constantFrom(...badAssetPaths) }),
  fc.record({ rule: fc.constant('demo-clip-missing' as const), demoClip: blank }),
  fc.record({ rule: fc.constant('still-image-missing' as const), view, path: blank }),
  fc.record({ rule: fc.constant('still-image-path' as const), view, path: fc.constantFrom(...badAssetPaths) }),
  fc.record({
    rule: fc.constant('kind-unknown' as const),
    kind: fc.constantFrom('monster', 'Exercise', '', undefined),
  }),
  fc.record({ rule: fc.constant('stretch-reps' as const), reps: fc.integer({ min: 1, max: 200 }) }),
);

const badCounts = fc.constantFrom(0, -1, 2.5, 11, 100, Number.NaN, Number.POSITIVE_INFINITY);

const routineBreakage: fc.Arbitrary<RoutineBreakage> = fc.oneof(
  fc.record({ rule: fc.constant('routine-id-missing' as const), id: blank }),
  fc.record({ rule: fc.constant('routine-id-duplicate' as const), pick: fc.nat() }),
  fc.record({ rule: fc.constant('routine-slug-duplicate' as const), pick: fc.nat() }),
  fc.record({
    rule: fc.constant('routine-slug-format' as const),
    slug: fc.constantFrom('empty', 'absent', 'upper', 'space'),
  }),
  fc.record({ rule: fc.constant('routine-name-missing' as const), nameId: blank }),
  fc.record({ rule: fc.constant('routine-steps-empty' as const), list }),
  fc.record({ rule: fc.constant('routine-cool-down-empty' as const), list }),
);

const stepBreakage: fc.Arbitrary<StepBreakage> = fc.oneof(
  fc.record({
    rule: fc.constant('step-entry-unknown' as const),
    entryId: fc.constantFrom<'no-such-entry' | '' | undefined>('no-such-entry', '', undefined),
  }),
  fc.record({ rule: fc.constant('step-entry-kind' as const) }),
  fc.record({
    rule: fc.constant('step-sets' as const),
    sets: fc.oneof(fc.constant(undefined), badCounts, fc.integer({ min: -50, max: 0 })),
  }),
  fc.record({
    rule: fc.constant('step-target-kind' as const),
    target: fc.constantFrom('both', 'neither', 'absent'),
  }),
  fc.record({
    rule: fc.constant('step-target-value' as const),
    value: fc.oneof(
      fc.constantFrom(0, -0, -3, 2.5, 0.1, Number.NaN, Number.POSITIVE_INFINITY),
      fc.integer({ min: -500, max: 0 }),
    ),
  }),
  fc.record({ rule: fc.constant('step-target-unit' as const) }),
  fc.record({
    rule: fc.constant('step-rest' as const),
    restSeconds: fc.constantFrom(-1, 601, 1.5, 100000, Number.NaN, Number.POSITIVE_INFINITY, undefined),
  }),
);

/**
 * Breakages that edit the same field cannot both apply to one entry, so each
 * entry gets at most one breakage per field.
 */
function fieldsOf(rule: CatalogRule): string[] {
  switch (rule) {
    case 'id-missing':
    case 'id-duplicate':
    case 'routine-id-missing':
    case 'routine-id-duplicate':
      return ['id'];
    case 'slug-duplicate':
    case 'slug-format':
    case 'routine-slug-duplicate':
    case 'routine-slug-format':
      return ['slug'];
    case 'target-kind':
    case 'target-value':
    case 'step-target-kind':
    case 'step-target-value':
      return ['target'];
    case 'kind-unknown':
      return ['kind'];
    case 'stretch-reps':
      return ['kind', 'target'];
    case 'coach-asset-missing':
    case 'coach-asset-path':
      return ['asset'];
    case 'still-image-missing':
    case 'still-image-path':
      return ['stills'];
    case 'step-entry-unknown':
      return ['entry'];
    // These two change the step's entry and its target unit together.
    case 'step-entry-kind':
    case 'step-target-unit':
      return ['entry', 'target'];
    case 'step-rest':
      return ['rest'];
    case 'step-sets':
      return ['sets'];
    default:
      return [rule];
  }
}

/**
 * Applies breakages in order, skipping one that cannot apply or whose field
 * an earlier applied breakage already edited. Returns the result and the
 * rules actually injected.
 */
function applyAll<T, B extends { readonly rule: CatalogRule }>(
  start: T,
  breakages: readonly B[],
  apply: (current: T, b: B) => T | undefined,
): { readonly result: T; readonly injected: CatalogRule[] } {
  const touched = new Set<string>();
  const injected: CatalogRule[] = [];
  let result = start;
  for (const b of breakages) {
    const fields = fieldsOf(b.rule);
    if (fields.some((f) => touched.has(f))) continue;
    const next = apply(result, b);
    if (next === undefined) continue;
    result = next;
    fields.forEach((f) => touched.add(f));
    injected.push(b.rule);
  }
  return { result, injected };
}

/** What earlier entries hold after their own breakages, for the duplicate breakages. */
interface EarlierEntries {
  readonly ids: readonly string[];
  readonly validSlugs: readonly string[];
}

const slugPattern = /^[a-z0-9-]+$/;

function isValidSlug(slug: string | undefined): slug is string {
  return slug !== undefined && slugPattern.test(slug);
}

/**
 * Applies one breakage to a draft. Returns undefined when it cannot apply:
 * a duplicate breakage needs an earlier entry with a non-blank id, or with a
 * valid slug, to copy.
 */
function applyBreakage(
  draft: ExerciseDraft,
  b: Breakage,
  index: number,
  earlier: EarlierEntries,
  referenced: boolean,
): ExerciseDraft | undefined {
  // A Routine_Step names a referenced entry, so its id, Kind and target stay valid.
  if (
    referenced &&
    ['id-missing', 'id-duplicate', 'kind-unknown', 'stretch-reps', 'target-kind', 'target-value'].includes(b.rule)
  ) {
    return undefined;
  }
  switch (b.rule) {
    case 'kind-unknown':
      return { ...draft, kind: b.kind };
    case 'stretch-reps':
      // Only a Stretch can break this rule; its seconds target becomes a valid reps target.
      return draft.kind === 'stretch' ? { ...draft, target: { reps: b.reps } } : undefined;
    case 'id-missing':
      return { ...draft, id: b.id };
    case 'id-duplicate': {
      const id = earlier.ids[b.pick % Math.max(earlier.ids.length, 1)];
      return id === undefined ? undefined : { ...draft, id };
    }
    case 'slug-duplicate': {
      const slug = earlier.validSlugs[b.pick % Math.max(earlier.validSlugs.length, 1)];
      return slug === undefined ? undefined : { ...draft, slug };
    }
    case 'slug-format': {
      // Non-empty broken slugs carry the index, so two entries never share one.
      const slugs = {
        empty: '',
        absent: undefined,
        upper: `E-${index}`,
        space: `e ${index}`,
        underscore: `e_${index}`,
        dot: `e.${index}`,
      } as const;
      return { ...draft, slug: slugs[b.slug] };
    }
    case 'target-kind': {
      // A reps target on a Stretch would also break stretch-reps, so skip that combination.
      if (b.target === 'both' && draft.kind === 'stretch') return undefined;
      const targets = { both: { reps: 1, seconds: 1 }, neither: {}, absent: undefined } as const;
      return { ...draft, target: targets[b.target] };
    }
    case 'target-value':
      if (b.kind === 'reps' && draft.kind === 'stretch') return undefined;
      return { ...draft, target: b.kind === 'reps' ? { reps: b.value } : { seconds: b.value } };
    case 'difficulty-unknown':
      return { ...draft, difficulty: b.difficulty };
    case 'step-count':
      return {
        ...draft,
        stepIds: b.count === undefined ? undefined : Array.from({ length: b.count }, (_, k) => `s${k}`),
      };
    case 'muscle-group-missing':
      return { ...draft, muscleGroups: b.list === 'empty' ? [] : undefined };
    case 'cue-missing':
      return { ...draft, cueIds: b.list === 'empty' ? [] : undefined };
    case 'safety-note-missing':
      return { ...draft, safetyNoteIds: b.list === 'empty' ? [] : undefined };
    case 'coach-asset-missing':
    case 'coach-asset-path':
      return { ...draft, coach: { ...draft.coach, asset: b.asset } };
    case 'demo-clip-missing':
      return { ...draft, coach: { ...draft.coach, demoClip: b.demoClip } };
    case 'still-image-missing':
    case 'still-image-path':
      return { ...draft, stills: { ...draft.stills, [b.view]: b.path } };
  }
}

type EntryKind = 'exercise' | 'stretch';

/** A Routine_Step before breakages: which entry of the right Kind, and valid numbers. */
const stepSeed = fc.record({
  pick: fc.nat(),
  sets: fc.integer({ min: 1, max: 10 }),
  value: fc.integer({ min: 1, max: 200 }),
  restSeconds: fc.integer({ min: 0, max: 600 }),
  breakages: fc.uniqueArray(stepBreakage, { selector: (b) => b.rule, maxLength: 4 }),
});

const routineSeed = fc.record({
  steps: fc.array(stepSeed, { minLength: 1, maxLength: 3 }),
  coolDown: fc.array(stepSeed, { minLength: 1, maxLength: 2 }),
  breakages: fc.uniqueArray(routineBreakage, { selector: (b) => b.rule, maxLength: 4 }),
});

/**
 * Entries of both Kinds (the first is an Exercise, the second a Stretch, so
 * every Routine_Step has something to name) with breakages, then Routines.
 */
const catalogCase = fc
  .array(fc.constantFrom<EntryKind>('exercise', 'stretch'), { maxLength: 3 })
  .chain((extra) =>
    fc.record({
      entries: fc.tuple(
        ...(['exercise', 'stretch', ...extra] as EntryKind[]).map((kind, index) =>
          fc.record({
            draft: validDraft(index, kind),
            breakages: fc.uniqueArray(breakage, { selector: (b) => b.rule, maxLength: 5 }),
          }),
        ),
      ),
      routines: fc.array(routineSeed, { maxLength: 2 }),
    }),
  );

/** Indexes of the valid entry drafts of one Kind. */
function indexesOf(drafts: readonly ExerciseDraft[], kind: EntryKind): number[] {
  return drafts.flatMap((d, i) => (d.kind === kind ? [i] : []));
}

/** The entry a seed names: an Exercise in `steps`, a Stretch in `coolDown`. */
function namedIndex(drafts: readonly ExerciseDraft[], list: 'steps' | 'coolDown', pick: number): number {
  const candidates = indexesOf(drafts, list === 'steps' ? 'exercise' : 'stretch');
  return candidates[pick % candidates.length] ?? 0;
}

/** The entry a step-entry-kind breakage swaps in: a Stretch in `steps`, an Exercise in `coolDown`. */
function swapIndex(drafts: readonly ExerciseDraft[], list: 'steps' | 'coolDown'): number {
  return indexesOf(drafts, list === 'steps' ? 'stretch' : 'exercise')[0] ?? 0;
}

type StepSeed = typeof stepSeed extends fc.Arbitrary<infer S> ? S : never;
type RoutineSeed = typeof routineSeed extends fc.Arbitrary<infer S> ? S : never;

function unitTarget(unit: 'reps' | 'seconds', value: number): { reps?: number; seconds?: number } {
  return unit === 'reps' ? { reps: value } : { seconds: value };
}

function unitOf(target: ExerciseDraft['target']): 'reps' | 'seconds' {
  return target?.reps !== undefined ? 'reps' : 'seconds';
}

/** A valid Routine_Step: names its entry and uses that entry's unit. */
function validStep(seed: StepSeed, list: 'steps' | 'coolDown', drafts: readonly ExerciseDraft[]): RoutineStepDraft {
  const entry = drafts[namedIndex(drafts, list, seed.pick)];
  return {
    entryId: entry?.id,
    sets: seed.sets,
    target: unitTarget(unitOf(entry?.target), seed.value),
    restSeconds: seed.restSeconds,
  };
}

function validRoutine(seed: RoutineSeed, ri: number, drafts: readonly ExerciseDraft[]): RoutineDraft {
  return {
    id: `r-${ri}`,
    slug: `r-${ri}`,
    nameId: `routine.r${ri}.name`,
    steps: seed.steps.map((s) => validStep(s, 'steps', drafts)),
    coolDown: seed.coolDown.map((s) => validStep(s, 'coolDown', drafts)),
  };
}

function applyStepBreakage(
  step: RoutineStepDraft,
  b: StepBreakage,
  list: 'steps' | 'coolDown',
  drafts: readonly ExerciseDraft[],
): RoutineStepDraft {
  const value = step.target?.reps ?? step.target?.seconds ?? 1;
  switch (b.rule) {
    case 'step-entry-unknown':
      return { ...step, entryId: b.entryId };
    case 'step-entry-kind': {
      // The entry and the target unit change together, so only the Kind is wrong.
      const swapped = drafts[swapIndex(drafts, list)];
      return { ...step, entryId: swapped?.id, target: unitTarget(unitOf(swapped?.target), value) };
    }
    case 'step-sets':
      return { ...step, sets: b.sets };
    case 'step-target-kind': {
      const targets = { both: { reps: 1, seconds: 1 }, neither: {}, absent: undefined } as const;
      return { ...step, target: targets[b.target] };
    }
    case 'step-target-value':
      // Keeps the valid unit, so the unit rule stays quiet.
      return { ...step, target: unitTarget(unitOf(step.target), b.value) };
    case 'step-target-unit':
      return { ...step, target: unitTarget(unitOf(step.target) === 'reps' ? 'seconds' : 'reps', value) };
    case 'step-rest':
      return { ...step, restSeconds: b.restSeconds };
  }
}

function applyRoutineBreakage(
  routine: RoutineDraft,
  b: RoutineBreakage,
  ri: number,
  earlier: EarlierEntries,
): RoutineDraft | undefined {
  switch (b.rule) {
    case 'routine-id-missing':
      return { ...routine, id: b.id };
    case 'routine-id-duplicate': {
      const id = earlier.ids[b.pick % Math.max(earlier.ids.length, 1)];
      return id === undefined ? undefined : { ...routine, id };
    }
    case 'routine-slug-duplicate': {
      const slug = earlier.validSlugs[b.pick % Math.max(earlier.validSlugs.length, 1)];
      return slug === undefined ? undefined : { ...routine, slug };
    }
    case 'routine-slug-format': {
      const slugs = { empty: '', absent: undefined, upper: `R-${ri}`, space: `r ${ri}` } as const;
      return { ...routine, slug: slugs[b.slug] };
    }
    case 'routine-name-missing':
      return { ...routine, nameId: b.nameId };
    case 'routine-steps-empty':
      return { ...routine, steps: b.list === 'empty' ? [] : undefined };
    case 'routine-cool-down-empty':
      return { ...routine, coolDown: b.list === 'empty' ? [] : undefined };
  }
}

/** Sorted `${id}:${rule}` strings, so a missing, extra or repeated violation shows. */
function keys(pairs: readonly { readonly subjectId: string; readonly rule: CatalogRule }[]): string[] {
  return pairs.map((p) => `${p.subjectId}:${p.rule}`).sort();
}

describe('Catalog', () => {
  it('shipped Catalog content passes validation', () => {
    // toEqual([]) prints every violation when shipped content breaks a rule.
    expect(validateCatalog(catalogContent)).toEqual([]);
  });

  it('the Catalog holds three Exercises and two Stretches in order', () => {
    const summary = (list: readonly (typeof entries)[number][]) =>
      list.map((entry) => ({
        name: t(entry.nameId),
        realName: t(entry.realNameId),
        kind: entry.kind,
        difficulty: entry.difficulty,
        muscleGroups: entry.muscleGroups,
        target: entry.target,
      }));

    expect(summary(exercises)).toEqual([
      {
        name: 'Grave Rise',
        realName: 'Air squat',
        kind: 'exercise',
        difficulty: 'beginner',
        muscleGroups: ['quads', 'glutes', 'core'],
        target: { reps: 10 },
      },
      {
        name: 'Skeleton Jacks',
        realName: 'Jumping jacks',
        kind: 'exercise',
        difficulty: 'beginner',
        muscleGroups: ['shoulders', 'glutes', 'calves'],
        target: { reps: 20 },
      },
      {
        name: 'Coffin Push',
        realName: 'Push-up',
        kind: 'exercise',
        difficulty: 'intermediate',
        muscleGroups: ['chest', 'triceps', 'shoulders', 'core'],
        target: { reps: 8 },
      },
    ]);
    expect(summary(stretches)).toEqual([
      {
        name: 'Gravestone Lean',
        realName: 'Standing side reach',
        kind: 'stretch',
        difficulty: 'beginner',
        muscleGroups: ['obliques', 'shoulders'],
        target: { seconds: 30 },
      },
      {
        name: 'Bat Hang',
        realName: 'Standing forward fold',
        kind: 'stretch',
        difficulty: 'beginner',
        muscleGroups: ['hamstrings', 'back', 'calves'],
        target: { seconds: 30 },
      },
    ]);
    expect(entries).toHaveLength(5);
  });

  it('every Stretch has a Safety_Note about a gentle pull and stopping at pain', () => {
    for (const entry of stretches) {
      const notes = entry.safetyNoteIds.map((id) => t(id));
      expect(
        notes.some((note) => /gentle pull/i.test(note) && /stop/i.test(note) && /pain/i.test(note)),
        `${entry.id}: ${notes.join(' | ')}`,
      ).toBe(true);
    }
  });

  it('every Exercise_Entry has Instruction_Steps, Cues and Safety_Notes from the Strings_Module', () => {
    for (const entry of entries) {
      const ids: readonly StringId[] = [
        entry.nameId,
        entry.realNameId,
        ...entry.stepIds,
        ...entry.cueIds,
        ...entry.safetyNoteIds,
      ];
      for (const locale of Object.keys(locales) as Locale[]) {
        for (const id of ids) {
          expect(locales[locale][id], `${entry.id}: ${id} in ${locale}`).toMatch(/\S/);
        }
      }
    }
  });

  it('an Exercise_Entry is found by its slug and Kind, and an unknown or wrong-Kind slug finds nothing', () => {
    expect(exerciseSlugs()).toEqual(['grave-rise', 'skeleton-jacks', 'coffin-push']);
    expect(stretchSlugs()).toEqual(['gravestone-lean', 'bat-hang']);
    expect(findExercise('grave-rise')).toBe(exercises[0]);
    expect(findStretch('bat-hang')).toBe(stretches[1]);
    // A Stretch is not an Exercise to the Exercise lookup, and the reverse.
    expect(findExercise('bat-hang')).toBeUndefined();
    expect(findStretch('grave-rise')).toBeUndefined();
    for (const lookup of [findExercise, findStretch]) {
      expect(lookup('no-such-entry')).toBeUndefined();
      expect(lookup('Grave-Rise')).toBeUndefined();
      expect(lookup('')).toBeUndefined();
    }
  });

  it('there is one broken example for every Catalog rule', () => {
    expect(ruleExamples.map((e) => e.rule).sort()).toEqual([...allRules].sort());
  });

  it('the valid fixture behind the broken examples passes validation', () => {
    expect(validateCatalog({ entries: [base, other, stretch], routines: [routine] })).toEqual([]);
  });

  it.each(ruleExamples)('Catalog validation reports $rule: $description', (example) => {
    expect(validateCatalog(draftOf(example))).toEqual([example.violation]);
  });

  it('Catalog validation reports a Stretch among the Routine steps as step-entry-kind', () => {
    const broken: RoutineDraft = {
      ...routine,
      steps: [{ ...routineStep, entryId: 'bat-hang', target: { seconds: 30 } }],
    };
    expect(validateCatalog({ entries: baseEntries, routines: [broken] })).toEqual([
      { subjectId: 'graveyard-shift/steps#0', rule: 'step-entry-kind' },
    ]);
  });

  // Feature: catalog-and-stretches, Property 1: Catalog validation reports exactly the broken rules
  // **Validates: Requirements 1.2, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13**
  it('Catalog validation reports exactly the broken rules', () => {
    fc.assert(
      fc.property(catalogCase, ({ entries: cases, routines: seeds }) => {
        const drafts = cases.map((e) => e.draft);
        const validRoutines = seeds.map((seed, ri) => validRoutine(seed, ri, drafts));

        // Valid content has no violations.
        expect(validateCatalog({ entries: drafts, routines: validRoutines })).toEqual([]);

        // Entries a Routine_Step names (or may swap in) keep their id, Kind and target.
        const referenced = new Set<number>();
        for (const seed of seeds) {
          for (const list of ['steps', 'coolDown'] as const) {
            for (const step of seed[list]) {
              referenced.add(namedIndex(drafts, list, step.pick));
              if (step.breakages.some((b) => b.rule === 'step-entry-kind')) {
                referenced.add(swapIndex(drafts, list));
              }
            }
          }
        }

        const broken: ExerciseDraft[] = [];
        const expected: { subjectId: string; rule: CatalogRule }[] = [];
        const ids: string[] = [];
        const validSlugs: string[] = [];

        cases.forEach(({ draft, breakages }, index) => {
          const { result: current, injected } = applyAll(draft, breakages, (d, b) =>
            applyBreakage(d, b, index, { ids, validSlugs }, referenced.has(index)),
          );

          const subjectId = current.id === undefined || current.id === '' ? `#${index}` : current.id;
          for (const rule of injected) expected.push({ subjectId, rule });

          if (subjectId === current.id) ids.push(current.id);
          if (isValidSlug(current.slug)) validSlugs.push(current.slug);
          broken.push(current);
        });

        const brokenRoutines: RoutineDraft[] = [];
        const routineIds: string[] = [];
        const routineSlugs: string[] = [];

        seeds.forEach((seed, ri) => {
          const applied = applyAll(validRoutines[ri] as RoutineDraft, seed.breakages, (r, b) =>
            applyRoutineBreakage(r, b, ri, { ids: routineIds, validSlugs: routineSlugs }),
          );
          let current = applied.result;
          const subjectId = current.id === undefined || current.id === '' ? `routine#${ri}` : current.id;
          for (const rule of applied.injected) expected.push({ subjectId, rule });

          for (const list of ['steps', 'coolDown'] as const) {
            const steps = current[list] ?? [];
            const stepDrafts: RoutineStepDraft[] = [];
            seed[list].forEach((stepSeedValue, i) => {
              const start = validStep(stepSeedValue, list, drafts);
              const { result, injected } = applyAll(start, stepSeedValue.breakages, (s, b) =>
                applyStepBreakage(s, b, list, drafts),
              );
              stepDrafts.push(result);
              // An emptied list has no steps left to report.
              if (steps.length > 0) {
                for (const rule of injected) expected.push({ subjectId: `${subjectId}/${list}#${i}`, rule });
              }
            });
            if (steps.length > 0) current = { ...current, [list]: stepDrafts };
          }

          if (subjectId === current.id) routineIds.push(current.id);
          if (isValidSlug(current.slug)) routineSlugs.push(current.slug);
          brokenRoutines.push(current);
        });

        expect(keys(validateCatalog({ entries: broken, routines: brokenRoutines }))).toEqual(keys(expected));
      }),
      { numRuns: 200 },
    );
  });
});
