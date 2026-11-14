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
  workoutView,
} from '@/workout-engine';
import type { Workout } from '@/workout-engine';

import { reachableWorkoutArbitrary, scriptRunArbitrary } from './support/workout';

type Phase = ReturnType<typeof workoutView>['phase'];
type CommandName =
  | 'confirmSet'
  | 'skipSet'
  | 'skipRest'
  | 'pauseWorkout'
  | 'autoPause'
  | 'resumeWorkout'
  | 'quitWorkout'
  | 'advance';

/** The allowed-command table: the phases in which each command takes effect. */
const allowedIn: Readonly<Record<CommandName, readonly Phase[]>> = {
  confirmSet: ['exercising'],
  skipSet: ['exercising'],
  skipRest: ['resting'],
  pauseWorkout: ['exercising', 'resting'],
  autoPause: ['exercising', 'resting'],
  resumeWorkout: ['paused'],
  quitWorkout: ['exercising', 'resting', 'paused'],
  advance: ['exercising', 'resting', 'paused'],
};

const commands: Readonly<Record<CommandName, (w: Workout, at: number) => Workout>> = {
  // Valid reps (0 to 200) so a rejection can only come from the phase.
  confirmSet: (w, at) => confirmSet(w, at, 10),
  skipSet,
  skipRest,
  pauseWorkout,
  autoPause,
  resumeWorkout,
  quitWorkout,
  advance,
};

const commandNames = Object.keys(commands) as CommandName[];

const anyWorkout = fc.oneof(
  scriptRunArbitrary.map((run) => ({ workout: run.workout, clock: run.clock })),
  reachableWorkoutArbitrary.map((run) => ({ workout: run.workout, clock: run.clock })),
);

describe('Workout engine commands by phase', () => {
  // Feature: skip-pause-quit, Property 5: Disallowed commands change nothing
  it('a command not allowed in the phase at its time returns the same Workout', () => {
    // **Validates: Requirements 1.4, 2.5, 3.4, 4.6, 4.7, 4.9, 5.2, 6.6, 6.7**
    fc.assert(
      fc.property(
        anyWorkout,
        fc.constantFrom(...commandNames),
        fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 700_000 })),
        ({ workout, clock }, name, byMs) => {
          const at = clock + byMs;
          // The phase that holds at the command's time; a summary stays a summary.
          const phase = workoutView(advance(workout, at)).phase;
          const result = commands[name](workout, at);
          if (!allowedIn[name].includes(phase)) {
            expect(result).toBe(workout);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('every command leaves a finished Workout as it was, advance included', () => {
    // **Validates: Requirements 1.4, 6.7**
    fc.assert(
      fc.property(
        anyWorkout.filter(({ workout }) => workout.phase === 'summary'),
        fc.constantFrom(...commandNames),
        fc.integer({ min: 0, max: 700_000 }),
        ({ workout, clock }, name, byMs) => {
          expect(commands[name](workout, clock + byMs)).toBe(workout);
        },
      ),
      { numRuns: 200 },
    );
  });
});
