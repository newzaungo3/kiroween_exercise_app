import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  advance,
  autoPause,
  confirmSet,
  pauseWorkout,
  quitWorkout,
  resumeWorkout,
  skipRest,
  skipSet,
} from '@/workout-engine';
import type { Workout } from '@/workout-engine';

import { reachableWorkoutArbitrary, scriptRunArbitrary } from './support/workout';

const newCommands: readonly (readonly [string, (workout: Workout, at: number) => Workout])[] = [
  ['skipSet', skipSet],
  ['skipRest', skipRest],
  ['pauseWorkout', pauseWorkout],
  ['autoPause', autoPause],
  ['resumeWorkout', resumeWorkout],
  ['quitWorkout', quitWorkout],
];

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

  // Feature: skip-pause-quit, Property 10: New commands leave their argument unchanged
  it('skip, pause, auto-pause, resume and quit leave the Workout they were given unchanged', () => {
    // **Validates: Requirements 1.2**
    fc.assert(
      fc.property(
        scriptRunArbitrary,
        fc.array(
          fc.record({
            command: fc.integer({ min: 0, max: newCommands.length - 1 }),
            byMs: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 700_000 })),
          }),
          { minLength: 1, maxLength: 12 },
        ),
        ({ workout, clock }, calls) => {
          let at = clock;
          for (const call of calls) {
            at += call.byMs;
            const entry = newCommands[call.command];
            if (entry === undefined) throw new Error('missing command');
            const [name, run] = entry;
            const before = structuredClone(workout);
            run(workout, at);
            expect(workout, name).toEqual(before);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
