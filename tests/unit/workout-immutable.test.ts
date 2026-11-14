import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { advance, confirmSet } from '@/workout-engine';

import { reachableWorkoutArbitrary } from './support/workout';

describe('Workout engine commands', () => {
  // Feature: happy-path-workout, Property 6: Commands leave their argument unchanged
  it('leave the Workout they were given unchanged', () => {
    // **Validates: Requirements 1.4**
    fc.assert(
      fc.property(
        reachableWorkoutArbitrary,
        fc.integer({ min: 0, max: 700_000 }),
        fc.oneof(
          fc.integer({ min: 0, max: 200 }),
          fc.integer({ min: -1000, max: 1000 }),
          fc.double({ noNaN: false }),
          fc.constant(undefined),
        ),
        ({ workout, clock }, byMs, reps) => {
          const at = clock + byMs;

          const beforeAdvance = structuredClone(workout);
          advance(workout, at);
          expect(workout).toEqual(beforeAdvance);

          const beforeConfirm = structuredClone(workout);
          confirmSet(workout, at, reps);
          expect(workout).toEqual(beforeConfirm);
        },
      ),
      { numRuns: 200 },
    );
  });
});
