import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { findRoutine } from '@/catalog';
import { confirmSet, startWorkout, workoutView } from '@/workout-engine';

const routine = findRoutine('graveyard-shift');
if (routine === undefined) throw new Error('Graveyard Shift is missing from the Catalog');

/** Numbers across and beyond the bounds, fractions, NaN and infinities. */
const anyNumber = fc.oneof(
  fc.integer({ min: -1000, max: 1000 }),
  fc.double({ noNaN: false }),
  fc.double({ min: -300, max: 300, noNaN: true }),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
);

describe('Actual_Reps on a reps Set', () => {
  // Feature: happy-path-workout, Property 4: Actual_Reps are accepted exactly in 0 to 200
  it('are accepted exactly when they are whole numbers from 0 to 200', () => {
    // **Validates: Requirements 3.2, 3.4**
    fc.assert(
      fc.property(anyNumber, (n) => {
        const start = startWorkout(routine, 0);
        const result = confirmSet(start, 1000, n);
        if (Number.isInteger(n) && n >= 0 && n <= 200) {
          expect(result.confirmed.at(-1)?.actualReps).toBe(n);
          expect(workoutView(result).candyEarned).toBe(workoutView(start).candyEarned + 1);
        } else {
          expect(result).toBe(start);
        }
      }),
      { numRuns: 200 },
    );
  });
});
