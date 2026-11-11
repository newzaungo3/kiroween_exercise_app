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
  type CatalogRule,
  type CatalogViolation,
  type ExerciseDraft,
} from './types';

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

  return rules;
}

/**
 * Returns every Catalog rule the content breaks, in Catalog order, each rule
 * at most once per Exercise_Entry. An Exercise_Entry without an identifier is
 * named `#<index>`. Valid content gives an empty list.
 */
export function validateCatalog(content: CatalogDraft): readonly CatalogViolation[] {
  const violations: CatalogViolation[] = [];
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();

  content.exercises.forEach((entry, index) => {
    const { id, slug } = entry;
    const rules: CatalogRule[] = [];
    let exerciseId: string;

    if (isBlank(id)) {
      exerciseId = `#${index}`;
      rules.push('id-missing');
    } else {
      exerciseId = id;
      if (seenIds.has(id)) rules.push('id-duplicate');
      seenIds.add(id);
    }

    if (!isBlank(slug)) {
      if (seenSlugs.has(slug)) rules.push('slug-duplicate');
      seenSlugs.add(slug);
    }

    rules.push(...entryRules(entry));
    for (const rule of rules) violations.push({ exerciseId, rule });
  });

  return violations;
}
