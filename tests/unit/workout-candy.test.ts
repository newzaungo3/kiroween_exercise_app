import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { candyFor } from '@/workout-engine/candy';

describe('the Candy rule', () => {
  // Feature: happy-path-workout, Property 1: The Candy rule
  it('earns 1 Candy per confirmed Set plus 5 only when every Set is confirmed', () => {
    // **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
    fc.assert(
      fc.property(
        fc
          .integer({ min: 1, max: 40 })
          .chain((total) =>
            fc.tuple(fc.constant(total), fc.integer({ min: 0, max: total })),
          ),
        ([total, confirmed]) => {
          const expected = confirmed === total ? confirmed + 5 : confirmed;
          expect(candyFor(confirmed, total)).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('the Completion_Bonus needs every Cool-down Set confirmed', () => {
    expect(candyFor(8, 9)).toBe(8);
    expect(candyFor(9, 9)).toBe(14);
  });

  it('an empty Workout earns 0 Candy', () => {
    expect(candyFor(0, 0)).toBe(0);
  });
});
