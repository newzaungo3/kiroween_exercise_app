/**
 * The Catalog validation function.
 *
 * Pure: imports only Catalog types and constants. It takes the loose
 * `CatalogDraft` shape, so tests can describe broken content without casts,
 * and the shipped `exercises` array is assignable to it.
 */
import {
  difficulties,
  type CatalogDraft,
  kinds,
  type CatalogRule,
  type CatalogViolation,
  type ExerciseDraft,
  type RoutineDraft,
  type RoutineStepDraft,
} from './types';

const knownKinds: ReadonlySet<string> = new Set(kinds);

const minSets = 1;
const maxSets = 10;
const maxRestSeconds = 600;

/** A slug may hold only lowercase letters, digits and hyphens. */
const slugPattern = /^[a-z0-9-]+$/;

/** A same-origin asset path under /assets/ with a safe character set. */
const assetPathPattern = /^\/assets\/[A-Za-z0-9._/-]+$/;

const minSteps = 3;
const maxSteps = 5;

const knownDifficulties: ReadonlySet<string> = new Set(difficulties);

function isBlank(value: string | undefined): value is '' | undefined {
  return value === undefined || value.length === 0;
}

function isEmptyList(list: readonly string[] | undefined): boolean {
  return list === undefined || list.length === 0;
}

/** True for a non-empty path that is not a safe same-origin path under /assets/. */
function isBadAssetPath(path: string | undefined): boolean {
  if (isBlank(path)) return false;
  return !assetPathPattern.test(path) || path.includes('..') || path.includes('//');
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/** The rules one Exercise_Entry breaks on its own, in the order of the design's table. */
function entryRules(entry: ExerciseDraft): CatalogRule[] {
  const rules: CatalogRule[] = [];

  if (isBlank(entry.slug) || !slugPattern.test(entry.slug)) {
    rules.push('slug-format');
  }

  const reps = entry.target?.reps;
  const seconds = entry.target?.seconds;
  if ((reps === undefined) === (seconds === undefined)) {
    rules.push('target-kind');
  } else if (!isPositiveInteger(reps ?? seconds ?? 0)) {
    rules.push('target-value');
  }

  if (entry.difficulty === undefined || !knownDifficulties.has(entry.difficulty)) {
    rules.push('difficulty-unknown');
  }

  const stepCount = entry.stepIds?.length ?? 0;
  if (stepCount < minSteps || stepCount > maxSteps) rules.push('step-count');
  if (isEmptyList(entry.muscleGroups)) rules.push('muscle-group-missing');
  if (isEmptyList(entry.cueIds)) rules.push('cue-missing');
  if (isEmptyList(entry.safetyNoteIds)) rules.push('safety-note-missing');

  if (isBlank(entry.coach?.asset)) rules.push('coach-asset-missing');
  if (isBadAssetPath(entry.coach?.asset)) rules.push('coach-asset-path');
  if (isBlank(entry.coach?.demoClip)) rules.push('demo-clip-missing');

  const stills = [entry.stills?.front, entry.stills?.side, entry.stills?.back];
  if (stills.some(isBlank)) rules.push('still-image-missing');
  if (stills.some(isBadAssetPath)) rules.push('still-image-path');

  if (entry.kind === undefined || !knownKinds.has(entry.kind)) {
    rules.push('kind-unknown');
  }
  if (entry.kind === 'stretch' && reps !== undefined) rules.push('stretch-reps');

  return rules;
}

type Unit = 'reps' | 'seconds';

/** The one unit a target uses, or undefined when it has none or both. */
function singleUnit(
  target: { readonly reps?: number; readonly seconds?: number } | undefined,
): Unit | undefined {
  const hasReps = target?.reps !== undefined;
  const hasSeconds = target?.seconds !== undefined;
  if (hasReps === hasSeconds) return undefined;
  return hasReps ? 'reps' : 'seconds';
}

function isIntegerInRange(value: number | undefined, min: number, max: number): boolean {
  return value !== undefined && Number.isInteger(value) && value >= min && value <= max;
}

/** The rules one Routine_Step breaks, given the entries it may refer to. */
function stepRules(
  step: RoutineStepDraft,
  list: 'steps' | 'coolDown',
  entries: readonly ExerciseDraft[],
): CatalogRule[] {
  const rules: CatalogRule[] = [];
  const entry = isBlank(step.entryId)
    ? undefined
    : entries.find((candidate) => !isBlank(candidate.id) && candidate.id === step.entryId);

  if (entry === undefined) {
    rules.push('step-entry-unknown');
  } else if (entry.kind !== undefined && knownKinds.has(entry.kind)) {
    const wanted = list === 'steps' ? 'exercise' : 'stretch';
    if (entry.kind !== wanted) rules.push('step-entry-kind');
  }

  if (!isIntegerInRange(step.sets, minSets, maxSets)) rules.push('step-sets');

  const stepUnit = singleUnit(step.target);
  if (stepUnit === undefined) {
    rules.push('step-target-kind');
  } else if (!isPositiveInteger(step.target?.[stepUnit] ?? 0)) {
    rules.push('step-target-value');
  }

  if (entry !== undefined && stepUnit !== undefined) {
    const entryUnit = singleUnit(entry.target);
    if (entryUnit !== undefined && entryUnit !== stepUnit) rules.push('step-target-unit');
  }

  if (!isIntegerInRange(step.restSeconds, 0, maxRestSeconds)) rules.push('step-rest');

  return rules;
}

/** The rules one Routine_Entry breaks on its own, before its steps. */
function routineRules(
  routine: RoutineDraft,
  seenIds: Set<string>,
  seenSlugs: Set<string>,
): CatalogRule[] {
  const rules: CatalogRule[] = [];
  const { id, slug } = routine;

  if (isBlank(id)) {
    rules.push('routine-id-missing');
  } else {
    if (seenIds.has(id)) rules.push('routine-id-duplicate');
    seenIds.add(id);
  }

  if (!isBlank(slug)) {
    if (seenSlugs.has(slug)) rules.push('routine-slug-duplicate');
    seenSlugs.add(slug);
  }
  if (isBlank(slug) || !slugPattern.test(slug)) rules.push('routine-slug-format');

  if (isBlank(routine.nameId)) rules.push('routine-name-missing');
  if (routine.steps === undefined || routine.steps.length === 0) {
    rules.push('routine-steps-empty');
  }
  if (routine.coolDown === undefined || routine.coolDown.length === 0) {
    rules.push('routine-cool-down-empty');
  }

  return rules;
}

/**
 * Returns every Catalog rule the content breaks, in Catalog order, each rule
 * at most once per subject. Subjects are named `#<index>` (entry),
 * `routine#<index>` (Routine_Entry) and `<routine>/steps#<i>` or
 * `<routine>/coolDown#<i>` (Routine_Step). Valid content gives an empty list.
 */
export function validateCatalog(content: CatalogDraft): readonly CatalogViolation[] {
  const violations: CatalogViolation[] = [];
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();

  content.entries.forEach((entry, index) => {
    const { id, slug } = entry;
    const rules: CatalogRule[] = [];
    let subjectId: string;

    if (isBlank(id)) {
      subjectId = `#${index}`;
      rules.push('id-missing');
    } else {
      subjectId = id;
      if (seenIds.has(id)) rules.push('id-duplicate');
      seenIds.add(id);
    }

    if (!isBlank(slug)) {
      if (seenSlugs.has(slug)) rules.push('slug-duplicate');
      seenSlugs.add(slug);
    }

    rules.push(...entryRules(entry));
    for (const rule of rules) violations.push({ subjectId, rule });
  });

  const routineIds = new Set<string>();
  const routineSlugs = new Set<string>();

  content.routines.forEach((routine, index) => {
    const routineSubject = isBlank(routine.id) ? `routine#${index}` : routine.id;
    for (const rule of routineRules(routine, routineIds, routineSlugs)) {
      violations.push({ subjectId: routineSubject, rule });
    }

    for (const list of ['steps', 'coolDown'] as const) {
      (routine[list] ?? []).forEach((step, i) => {
        const subjectId = `${routineSubject}/${list}#${i}`;
        for (const rule of stepRules(step, list, content.entries)) {
          violations.push({ subjectId, rule });
        }
      });
    }
  });

  return violations;
}
