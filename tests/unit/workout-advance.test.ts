/**
 * Advancing the Workout_Clock in parts equals advancing at once, and the Rest
 * timer follows the clock. Public interface only; the clock is always an argument.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { advance, workoutView } from '@/workout-engine';
import { reachableWorkoutArbitrary } from './support/workout';

const numRuns = 200;

describe('advancing the Workout_Clock', () => {
  // Feature: happy-path-workout, Property 3: Advancing in parts equals advancing at once
  // **Validates: Requirements 1.6, 4.1, 4.3, 4.4**
  it('advancing in two parts shows the same view as advancing once', () => {
    fc.assert(
      fc.property(
        reachableWorkoutArbitrary,
        fc.integer({ min: 0, max: 800_000 }),
        fc.integer({ min: 0, max: 800_000 }),
        ({ workout, clock }, x, y) => {
          const a = clock + Math.min(x, y);
          const b = clock + Math.max(x, y);
          expect(workoutView(advance(advance(workout, a), b))).toEqual(
            workoutView(advance(workout, b)),
          );
        },
      ),
      { numRuns },
    );
  });

  // Feature: happy-path-workout, Property 3: Advancing in parts equals advancing at once
  it('a clock value earlier than the latest one leaves the view unchanged', () => {
    fc.assert(
      fc.property(
        reachableWorkoutArbitrary,
        fc.integer({ min: 1, max: 1_000_000 }),
        ({ workout, clock }, back) => {
          expect(workoutView(advance(workout, clock - back))).toEqual(workoutView(workout));
        },
      ),
      { numRuns },
    );
  });

  // Feature: happy-path-workout, Property 3: Advancing in parts equals advancing at once
  it('a Rest counts down with the clock and hands over to the next Set at its end', () => {
    fc.assert(
      fc.property(
        reachableWorkoutArbitrary,
        fc.integer({ min: 0, max: 800_000 }),
        ({ workout }, delta) => {
          const before = workoutView(workout);
          fc.pre(before.phase === 'resting');
          if (before.phase !== 'resting') return;
          const remaining = before.restRemainingMs;
          const after = workoutView(advance(workout, workout.clock + delta));

          if (delta < remaining) {
            expect(after.phase).toBe('resting');
            if (after.phase === 'resting') {
              expect(after.restRemainingMs).toBe(remaining - delta);
              expect(after.next).toEqual(before.next);
            }
            return;
          }

          // Rest ended: the next Set is current and counts from the Rest end.
          expect(after.phase).toBe('exercising');
          if (after.phase !== 'exercising') return;
          expect(after.position).toBe(before.nextPosition);
          expect(after.slot).toEqual(before.next);
          if (after.timer.kind === 'seconds') {
            expect(after.timer.remainingMs).toBe(
              Math.max(0, after.timer.targetSeconds * 1000 - (delta - remaining)),
            );
          }
        },
      ),
      { numRuns },
    );
  });
});
