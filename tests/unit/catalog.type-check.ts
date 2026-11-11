/**
 * Type-level fixtures for the Catalog.
 *
 * `tsc --noEmit` checks this file; Vitest does not collect it (the name does
 * not end in `.test.ts`). Each `@ts-expect-error` line below must stay a type
 * error. If the Catalog stops rejecting one of these cases, the directive
 * becomes unused and the Type_Check fails.
 *
 * The fixtures sit inside a function that is never called, so importing this
 * file runs nothing and changes no Catalog content.
 */
import { exercises, type ExerciseTarget } from '@/catalog';

export function catalogTypeFixtures(): void {
  const first = exercises[0];
  if (first === undefined) return;

  // Reading the same field and copying the same list passes, and a target
  // with only reps or only seconds passes, so the three lines below fail for
  // the reason they name and not because the values themselves are wrong.
  const slug: string = first.slug;
  [...first.stepIds].push('exercise.graveRise.step1');
  const repsOnly: ExerciseTarget = { reps: 1 };
  const secondsOnly: ExerciseTarget = { seconds: 1 };

  // @ts-expect-error Catalog content is read-only
  first.slug = 'other';

  // @ts-expect-error Catalog lists are read-only
  first.stepIds.push('exercise.graveRise.step1');

  // @ts-expect-error a target has reps or seconds, never both
  const both: ExerciseTarget = { reps: 1, seconds: 1 };

  void [slug, repsOnly, secondsOnly, both];
}
