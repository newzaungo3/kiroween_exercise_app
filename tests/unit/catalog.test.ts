import fc from 'fast-check';

import { describe, expect, it } from 'vitest';

import {
  difficulties,
  exerciseSlugs,
  exercises,
  findExercise,
  muscleGroups,
  stillViews,
  validateCatalog,
  type CatalogRule,
  type CatalogViolation,
  type ExerciseDraft,
  type StillView,
} from '@/catalog';
import { locales, t, type Locale, type StringId } from '@/ui/strings';

// ---------------------------------------------------------------------------
// Fixtures for the per-rule examples
// ---------------------------------------------------------------------------

/** A readable valid Exercise draft with id and slug `id`. */
function validEntry(id: string): ExerciseDraft {
  return {
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
  readonly exercises: readonly ExerciseDraft[];
  readonly violation: CatalogViolation;
}

const base = validEntry('grave-rise');
const other = validEntry('skeleton-jacks');

const ruleExamples: readonly RuleExample[] = [
  {
    rule: 'id-missing',
    description: 'an Exercise_Entry with an empty identifier is named by its position',
    exercises: [other, { ...base, id: '' }],
    violation: { exerciseId: '#1', rule: 'id-missing' },
  },
  {
    rule: 'id-duplicate',
    description: 'two Exercise_Entries share an identifier',
    exercises: [base, { ...other, id: 'grave-rise' }],
    violation: { exerciseId: 'grave-rise', rule: 'id-duplicate' },
  },
  {
    rule: 'slug-duplicate',
    description: 'two Exercise_Entries share a slug',
    exercises: [base, { ...other, slug: 'grave-rise' }],
    violation: { exerciseId: 'skeleton-jacks', rule: 'slug-duplicate' },
  },
  {
    rule: 'slug-format',
    description: 'a slug with an uppercase letter and a space',
    exercises: [{ ...base, slug: 'Grave Rise' }],
    violation: { exerciseId: 'grave-rise', rule: 'slug-format' },
  },
  {
    rule: 'target-kind',
    description: 'an Exercise targets both reps and seconds',
    exercises: [{ ...base, target: { reps: 10, seconds: 30 } }],
    violation: { exerciseId: 'grave-rise', rule: 'target-kind' },
  },
  {
    rule: 'target-value',
    description: 'a target of 0 reps',
    exercises: [{ ...base, target: { reps: 0 } }],
    violation: { exerciseId: 'grave-rise', rule: 'target-value' },
  },
  {
    rule: 'difficulty-unknown',
    description: 'a Difficulty outside Beginner, Intermediate and Advanced',
    exercises: [{ ...base, difficulty: 'expert' }],
    violation: { exerciseId: 'grave-rise', rule: 'difficulty-unknown' },
  },
  {
    rule: 'step-count',
    description: 'only two Instruction_Steps',
    exercises: [{ ...base, stepIds: ['step1', 'step2'] }],
    violation: { exerciseId: 'grave-rise', rule: 'step-count' },
  },
  {
    rule: 'muscle-group-missing',
    description: 'no Muscle_Group',
    exercises: [{ ...base, muscleGroups: [] }],
    violation: { exerciseId: 'grave-rise', rule: 'muscle-group-missing' },
  },
  {
    rule: 'cue-missing',
    description: 'no Cue',
    exercises: [{ ...base, cueIds: [] }],
    violation: { exerciseId: 'grave-rise', rule: 'cue-missing' },
  },
  {
    rule: 'safety-note-missing',
    description: 'no Safety_Note',
    exercises: [{ ...base, safetyNoteIds: [] }],
    violation: { exerciseId: 'grave-rise', rule: 'safety-note-missing' },
  },
  {
    rule: 'coach-asset-missing',
    description: 'an empty Coach_Asset path',
    exercises: [{ ...base, coach: { ...base.coach, asset: '' } }],
    violation: { exerciseId: 'grave-rise', rule: 'coach-asset-missing' },
  },
  {
    rule: 'coach-asset-path',
    description: 'a Coach_Asset path that climbs out of /assets/',
    exercises: [{ ...base, coach: { ...base.coach, asset: '/assets/../secret.glb' } }],
    violation: { exerciseId: 'grave-rise', rule: 'coach-asset-path' },
  },
  {
    rule: 'demo-clip-missing',
    description: 'an empty Demo_Clip name',
    exercises: [{ ...base, coach: { ...base.coach, demoClip: '' } }],
    violation: { exerciseId: 'grave-rise', rule: 'demo-clip-missing' },
  },
  {
    rule: 'still-image-missing',
    description: 'no side Still_Image',
    exercises: [{ ...base, stills: { ...base.stills, side: undefined } }],
    violation: { exerciseId: 'grave-rise', rule: 'still-image-missing' },
  },
  {
    rule: 'still-image-path',
    description: 'a back Still_Image on another origin',
    exercises: [{ ...base, stills: { ...base.stills, back: 'https://example.com/assets/back.png' } }],
    violation: { exerciseId: 'grave-rise', rule: 'still-image-path' },
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
};
const allRules = Object.keys(everyRule) as CatalogRule[]; // keys of a value typed by CatalogRule

// ---------------------------------------------------------------------------
// Generators for Property 1
// ---------------------------------------------------------------------------

/** A valid Exercise draft at position `index`: id and slug `e-<index>`. */
function validDraft(index: number): fc.Arbitrary<ExerciseDraft> {
  const ids = (kind: string, count: number): string[] =>
    Array.from({ length: count }, (_, k) => `exercise.e${index}.${kind}${k + 1}`);
  return fc
    .record({
      target: fc.oneof(
        fc.integer({ min: 1, max: 200 }).map((reps) => ({ reps })),
        fc.integer({ min: 1, max: 200 }).map((seconds) => ({ seconds })),
      ),
      difficulty: fc.constantFrom(...difficulties),
      steps: fc.integer({ min: 3, max: 5 }),
      muscles: fc.subarray([...muscleGroups], { minLength: 1, maxLength: 3 }),
      cues: fc.integer({ min: 1, max: 3 }),
      notes: fc.integer({ min: 1, max: 3 }),
    })
    .map(({ target, difficulty, steps, muscles, cues, notes }) => ({
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
  | { readonly rule: 'still-image-path'; readonly view: StillView; readonly path: string };

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
);

/**
 * Breakages that edit the same field cannot both apply to one entry, so each
 * entry gets at most one breakage per field.
 */
function fieldOf(rule: CatalogRule): string {
  switch (rule) {
    case 'id-missing':
    case 'id-duplicate':
      return 'id';
    case 'slug-duplicate':
    case 'slug-format':
      return 'slug';
    case 'target-kind':
    case 'target-value':
      return 'target';
    case 'coach-asset-missing':
    case 'coach-asset-path':
      return 'asset';
    case 'still-image-missing':
    case 'still-image-path':
      return 'stills';
    default:
      return rule;
  }
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
): ExerciseDraft | undefined {
  switch (b.rule) {
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
      const targets = { both: { reps: 1, seconds: 1 }, neither: {}, absent: undefined } as const;
      return { ...draft, target: targets[b.target] };
    }
    case 'target-value':
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

/** A Catalog of valid drafts, each with a set of breakages (at most one per field). */
const catalogCase = fc.integer({ min: 1, max: 5 }).chain((count) =>
  fc.tuple(
    ...Array.from({ length: count }, (_, index) =>
      fc.record({
        draft: validDraft(index),
        breakages: fc.uniqueArray(breakage, { selector: (b) => fieldOf(b.rule), maxLength: 5 }),
      }),
    ),
  ),
);

/** Sorted `${id}:${rule}` strings, so a missing, extra or repeated violation shows. */
function keys(pairs: readonly { readonly exerciseId: string; readonly rule: CatalogRule }[]): string[] {
  return pairs.map((p) => `${p.exerciseId}:${p.rule}`).sort();
}

describe('Catalog', () => {
  it('shipped Catalog content passes validation', () => {
    // toEqual([]) prints every violation when shipped content breaks a rule.
    expect(validateCatalog({ exercises })).toEqual([]);
  });

  it('the Catalog holds one Exercise, Grave Rise, for Beginners', () => {
    expect(exercises).toHaveLength(1);
    const graveRise = exercises[0];
    expect(graveRise?.slug).toBe('grave-rise');
    expect(graveRise && t(graveRise.nameId)).toBe('Grave Rise');
    expect(graveRise && t(graveRise.realNameId)).toBe('Air squat');
    expect(graveRise?.difficulty).toBe('beginner');
    expect(graveRise?.muscleGroups).toEqual(['quads', 'glutes', 'core']);
    // A Grave Rise Set targets reps, never seconds.
    expect(graveRise?.target.reps).toBeGreaterThan(0);
    expect(graveRise?.target.seconds).toBeUndefined();
  });

  it('every Exercise_Entry has Instruction_Steps, Cues and Safety_Notes from the Strings_Module', () => {
    for (const entry of exercises) {
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

  it('an Exercise_Entry is found by its slug and an unknown slug finds nothing', () => {
    expect(exerciseSlugs()).toEqual(['grave-rise']);
    expect(findExercise('grave-rise')).toBe(exercises[0]);
    expect(findExercise('no-such-exercise')).toBeUndefined();
    expect(findExercise('Grave-Rise')).toBeUndefined();
    expect(findExercise('')).toBeUndefined();
  });

  it('there is one broken example for every Catalog rule', () => {
    expect(ruleExamples.map((e) => e.rule).sort()).toEqual([...allRules].sort());
  });

  it('the valid fixture behind the broken examples passes validation', () => {
    expect(validateCatalog({ exercises: [base, other] })).toEqual([]);
  });

  it.each(ruleExamples)('Catalog validation reports $rule: $description', (example) => {
    expect(validateCatalog({ exercises: example.exercises })).toEqual([example.violation]);
  });

  // Feature: exercise-page-3d-coach, Property 1: Catalog validation reports exactly the broken rules
  // **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 1.2, 1.5**
  it('Catalog validation reports exactly the broken rules', () => {
    fc.assert(
      fc.property(catalogCase, (entries) => {
        // Valid content has no violations.
        expect(validateCatalog({ exercises: entries.map((e) => e.draft) })).toEqual([]);

        const broken: ExerciseDraft[] = [];
        const expected: { exerciseId: string; rule: CatalogRule }[] = [];
        const ids: string[] = [];
        const validSlugs: string[] = [];

        entries.forEach(({ draft, breakages }, index) => {
          let current = draft;
          const injected: CatalogRule[] = [];
          for (const b of breakages) {
            const next = applyBreakage(current, b, index, { ids, validSlugs });
            if (next === undefined) continue;
            current = next;
            injected.push(b.rule);
          }

          const exerciseId = current.id === undefined || current.id === '' ? `#${index}` : current.id;
          for (const rule of injected) expected.push({ exerciseId, rule });

          if (exerciseId === current.id) ids.push(current.id);
          if (isValidSlug(current.slug)) validSlugs.push(current.slug);
          broken.push(current);
        });

        expect(keys(validateCatalog({ exercises: broken }))).toEqual(keys(expected));
      }),
      { numRuns: 200 },
    );
  });
});
