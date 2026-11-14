import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  findEntry,
  findRoutine,
  routineMinutes,
  routineSeconds,
  secondsPerRep,
  type ExerciseTarget,
  type RoutineEntry,
  type RoutineStep,
} from '@/catalog';

// A valid RoutineStep: Sets 1-10, one target unit > 0, Rest 0-600 s.
const stepArb: fc.Arbitrary<RoutineStep> = fc.record({
  entryId: fc.constantFrom('grave-rise', 'skeleton-jacks', 'gravestone-lean'),
  sets: fc.integer({ min: 1, max: 10 }),
  target: fc.oneof(
    fc.integer({ min: 1, max: 200 }).map((reps): ExerciseTarget => ({ reps })),
    fc.integer({ min: 1, max: 600 }).map((seconds): ExerciseTarget => ({ seconds })),
  ),
  restSeconds: fc.integer({ min: 0, max: 600 }),
});

const routineArb: fc.Arbitrary<RoutineEntry> = fc.record({
  id: fc.constant('generated'),
  slug: fc.constant('generated'),
  nameId: fc.constant('routine.graveyardShift.name' as const),
  steps: fc.array(stepArb, { minLength: 1, maxLength: 8 }),
  coolDown: fc.array(stepArb, { minLength: 1, maxLength: 4 }),
});

/** Independent oracle: a plain loop over every step. */
function expectedSeconds(routine: RoutineEntry): number {
  let total = 0;
  for (const step of [...routine.steps, ...routine.coolDown]) {
    const work =
      step.target.reps !== undefined
        ? step.target.reps * secondsPerRep
        : (step.target.seconds ?? 0);
    for (let set = 0; set < step.sets; set += 1) {
      total += work + step.restSeconds;
    }
  }
  return total;
}

describe('the Routine length estimate', () => {
  // Feature: catalog-and-stretches, Property 2: The Estimated_Length is the sum of Sets × (work + Rest), rounded to the nearest minute
  // **Validates: Requirements 5.1, 5.2, 5.3**
  it('the Estimated_Length is the sum of Sets × (work + Rest), rounded to the nearest minute', () => {
    fc.assert(
      fc.property(routineArb, (routine) => {
        const seconds = expectedSeconds(routine);
        expect(routineSeconds(routine)).toBe(seconds);

        const minutes = routineMinutes(routine);
        expect(Number.isInteger(minutes)).toBe(true);
        expect(Math.abs(minutes * 60 - seconds)).toBeLessThanOrEqual(30);
      }),
      { numRuns: 200 },
    );
  });

  // **Validates: Requirements 5.4**
  it('Graveyard Shift is between 540 and 660 seconds and rounds to 10 minutes', () => {
    const routine = findRoutine('graveyard-shift');
    expect(routine).toBeDefined();
    if (!routine) return;

    const seconds = routineSeconds(routine);
    expect(seconds).toBe(578);
    expect(seconds).toBeGreaterThanOrEqual(540);
    expect(seconds).toBeLessThanOrEqual(660);
    expect(routineMinutes(routine)).toBe(10);
  });

  // **Validates: Requirements 3.5**
  it('Graveyard Shift ends with a Cool-down of Stretches', () => {
    const routine = findRoutine('graveyard-shift');
    expect(routine).toBeDefined();
    if (!routine) return;

    expect(routine.coolDown.length).toBeGreaterThan(0);
    for (const step of routine.coolDown) {
      expect(findEntry('stretch', step.entryId)?.kind).toBe('stretch');
    }
    expect(routine.steps.length).toBeGreaterThan(0);
    for (const step of routine.steps) {
      expect(findEntry('exercise', step.entryId)?.kind).toBe('exercise');
    }
  });
});
