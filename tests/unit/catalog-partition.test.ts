import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  entries,
  exercises,
  findExercise,
  findStretch,
  partitionByKind,
  stretches,
  type Kind,
} from '@/catalog';

/** A tagged item: `id` is unique per generated item so order is checkable. */
type Item = { readonly id: number; readonly kind: Kind };

const itemsArb = fc
  .array(fc.constantFrom<Kind>('exercise', 'stretch'), { maxLength: 30 })
  .map((kinds): readonly Item[] => kinds.map((kind, id) => ({ id, kind })));

describe('the Kind partition', () => {
  // Feature: catalog-and-stretches, Property 4: Kind partition keeps every entry once, in order
  // **Validates: Requirements 1.3, 1.4, 6.1, 6.2, 7.3**
  it('the Kind partition keeps every entry once, in order', () => {
    fc.assert(
      fc.property(itemsArb, (list) => {
        const result = partitionByKind(list);

        // Each list holds only its own Kind.
        expect(result.exercises.every((e) => e.kind === 'exercise')).toBe(true);
        expect(result.stretches.every((e) => e.kind === 'stretch')).toBe(true);

        // Union is the whole list and the lists do not overlap.
        const exerciseIds = result.exercises.map((e) => e.id);
        const stretchIds = result.stretches.map((e) => e.id);
        expect(exerciseIds.filter((id) => stretchIds.includes(id))).toEqual([]);
        expect(
          [...exerciseIds, ...stretchIds].sort((a, b) => a - b),
        ).toEqual(list.map((e) => e.id));

        // Each list keeps the input order.
        expect(exerciseIds).toEqual(
          list.filter((e) => e.kind === 'exercise').map((e) => e.id),
        );
        expect(stretchIds).toEqual(
          list.filter((e) => e.kind === 'stretch').map((e) => e.id),
        );
      }),
      { numRuns: 200 },
    );
  });

  it('the Exercises are Grave Rise, Skeleton Jacks, Coffin Push in order', () => {
    expect(exercises.map((e) => e.slug)).toEqual([
      'grave-rise',
      'skeleton-jacks',
      'coffin-push',
    ]);
  });

  it('the Stretches are Gravestone Lean, Bat Hang in order', () => {
    expect(stretches.map((e) => e.slug)).toEqual(['gravestone-lean', 'bat-hang']);
  });

  it('every shipped entry is in exactly one of the Exercises and the Stretches', () => {
    expect(exercises.length + stretches.length).toBe(entries.length);
    expect([...exercises, ...stretches].map((e) => e.id).sort()).toEqual(
      entries.map((e) => e.id).sort(),
    );
  });

  it('a Stretch slug finds nothing as an Exercise and the reverse', () => {
    for (const stretch of stretches) {
      expect(findExercise(stretch.slug)).toBeUndefined();
      expect(findStretch(stretch.slug)).toBe(stretch);
    }
    for (const exercise of exercises) {
      expect(findStretch(exercise.slug)).toBeUndefined();
      expect(findExercise(exercise.slug)).toBe(exercise);
    }
  });
});
