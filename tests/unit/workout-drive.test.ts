import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { advance, buildSetSlots, candyFor, confirmSet, workoutView } from '@/workout-engine';
import { playerPlanArbitrary, playWorkout, routineArbitrary, slotCount } from './support/workout';

describe('a driven Workout', () => {
  // Feature: happy-path-workout, Property 7: A driven Workout reports what its commands did
  // Validates: Requirements 3.1, 3.9-3.11, 4.2, 4.5, 4.6, 5.2, 6.1-6.4, 7.1
  it('reports what its commands did', () => {
    fc.assert(
      fc.property(routineArbitrary, playerPlanArbitrary, (routine, plan) => {
        const result = playWorkout(routine, plan);
        const slots = buildSetSlots(routine);
        const total = slotCount(routine);
        expect(result.played).toHaveLength(total);

        result.played.forEach((set, i) => {
          // Slots come in the Routine's order.
          expect(set.slotIndex).toBe(i);
          expect(set.before.slot).toEqual(slots[i]);
          expect(set.before.position).toBe(i + 1);

          const slot = slots[i];
          const isFinal = i === total - 1;
          if (isFinal) {
            // Never a Rest after the final Set.
            expect(set.after.phase).toBe('summary');
            expect(set.afterRest).toBeNull();
          } else if (slot !== undefined && slot.restSeconds > 0) {
            expect(set.after.phase).toBe('resting');
            if (set.after.phase === 'resting') {
              expect(set.after.next).toEqual(slots[i + 1]);
              expect(set.after.nextPosition).toBe(i + 2);
              expect(set.after.candyEarned).toBe(set.candyBefore + 1);
            }
            expect(set.afterRest?.phase).toBe('exercising');
          } else {
            expect(set.after.phase).toBe('exercising');
            expect(set.after.candyEarned).toBe(set.candyBefore + 1);
            expect(set.afterRest).toBeNull();
          }
        });

        const summary = workoutView(result.workout);
        expect(summary.phase).toBe('summary');
        if (summary.phase !== 'summary') return;
        expect(summary.outcome).toBe('completed');
        expect(summary.setsConfirmed).toBe(total);
        expect(summary.setsSkipped).toBe(0);
        expect(summary.candyEarned).toBe(candyFor(total, total));
        expect(summary.candyEarned).toBe(total + 5);
        expect(summary.bonusIncluded).toBe(true);
        expect(summary.activeMs).toBe(result.finalConfirmClock - result.startClock);

        // The summary is final: later commands change nothing.
        const later = result.finalConfirmClock + 1_000_000;
        expect(workoutView(advance(result.workout, later))).toEqual(summary);
        expect(workoutView(confirmSet(result.workout, later, 5))).toEqual(summary);
      }),
      { numRuns: 200 },
    );
  });
});
