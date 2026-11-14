import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { findRoutine } from '@/catalog';
import type { RoutineEntry } from '@/catalog';
import { advance, confirmSet, startWorkout, workoutView } from '@/workout-engine';

const found = findRoutine('graveyard-shift');
if (found === undefined) throw new Error('Graveyard Shift is missing from the Catalog');
const graveyardShift: RoutineEntry = found;

/** A Routine whose first step is a seconds-based Stretch with the given target. */
function timedRoutine(seconds: number): RoutineEntry {
  const [first, ...rest] = graveyardShift.coolDown;
  if (first === undefined) throw new Error('Graveyard Shift has no Cool-down');
  return {
    ...graveyardShift,
    steps: [{ ...first, target: { seconds } }, ...rest],
    coolDown: graveyardShift.coolDown,
  };
}

describe('timed Sets', () => {
  // Feature: happy-path-workout, Property 5: A timed Set waits for its countdown
  it('a timed Set can only be confirmed once its countdown has reached zero', () => {
    // **Validates: Requirements 3.5, 3.6, 3.7**
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 300 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 400_000 }),
        (target, start, e) => {
          const w = startWorkout(timedRoutine(target), start);
          const at = advance(w, start + e);
          const view = workoutView(at);

          expect(view.phase).toBe('exercising');
          if (view.phase !== 'exercising' || view.timer.kind !== 'seconds') {
            throw new Error('expected a seconds Set');
          }
          const initial = workoutView(w);
          if (initial.phase !== 'exercising') throw new Error('expected an exercising start');
          expect(view.slot).toEqual(initial.slot);
          expect(view.timer.remainingMs).toBe(Math.max(0, target * 1000 - e));

          const confirmed = confirmSet(w, start + e);
          if (e < target * 1000) {
            expect(confirmed).toBe(w);
          } else {
            expect(confirmed).not.toBe(w);
            expect(workoutView(confirmed).candyEarned).toBe(1);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('the first Set of the Cool-down moves to rest when its countdown ends', () => {
    const w = startWorkout(timedRoutine(30), 0);
    expect(confirmSet(w, 29_999)).toBe(w);
    expect(workoutView(confirmSet(w, 30_000)).phase).toBe('resting');
  });
});
