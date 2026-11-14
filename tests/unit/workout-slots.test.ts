import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { findRoutine } from '@/catalog';
import type { RoutineEntry } from '@/catalog';
import { buildSetSlots, startWorkout, workoutView } from '@/workout-engine';
import type { SetSlot } from '@/workout-engine';
import { routineArbitrary, slotCount } from './support/workout';

/** The expected slots, built by a plain nested loop over steps then Cool-down. */
function expectedSlots(routine: RoutineEntry): SetSlot[] {
  const expected: SetSlot[] = [];
  const all = [...routine.steps, ...routine.coolDown];
  for (let s = 0; s < all.length; s += 1) {
    const step = all[s];
    if (step === undefined) throw new Error('missing step');
    for (let n = 1; n <= step.sets; n += 1) {
      expected.push({
        entryId: step.entryId,
        setNumber: n,
        setCount: step.sets,
        target: step.target,
        restSeconds: step.restSeconds,
      });
    }
  }
  return expected;
}

describe('Set_Slots follow the Routine', () => {
  // Feature: happy-path-workout, Property 2: Set_Slots follow the Routine
  // **Validates: Requirements 2.1, 2.2, 2.3, 2.5**
  it('Set_Slots follow the Routine in order and a new Workout starts on the first Set', () => {
    fc.assert(
      fc.property(routineArbitrary, fc.integer({ min: 0, max: 1_000_000 }), (routine, at) => {
        const slots = buildSetSlots(routine);
        expect(slots).toEqual(expectedSlots(routine));
        expect(slots.length).toBe(slotCount(routine));

        const view = workoutView(startWorkout(routine, at));
        expect(view.phase).toBe('exercising');
        if (view.phase !== 'exercising') return;
        expect(view.position).toBe(1);
        expect(view.totalSets).toBe(slotCount(routine));
      }),
      { numRuns: 200 },
    );
  });

  // **Validates: Requirements 2.1, 2.2, 2.5**
  it('Graveyard Shift has 9 Set_Slots in order', () => {
    const routine = findRoutine('graveyard-shift');
    expect(routine).toBeDefined();
    if (!routine) return;

    const order = [
      ['skeleton-jacks', 2],
      ['grave-rise', 3],
      ['coffin-push', 2],
      ['gravestone-lean', 1],
      ['bat-hang', 1],
    ] as const;
    const expectedIds = order.flatMap(([id, count]) => Array.from({ length: count }, () => id));

    const slots = buildSetSlots(routine);
    expect(slots).toHaveLength(9);
    expect(slots.map((slot) => slot.entryId)).toEqual(expectedIds);
  });
});
