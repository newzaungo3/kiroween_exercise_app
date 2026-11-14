import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { findRoutine } from '@/catalog';
import {
  advance,
  autoPause,
  confirmSet,
  pauseWorkout,
  quitWorkout,
  resumeWorkout,
  startWorkout,
  workoutView,
} from '@/workout-engine';
import type { ExercisingView, RestingView, Workout } from '@/workout-engine';

import { commandScriptArbitrary, playScript, routineArbitrary } from './support/workout';

type Frozen = ExercisingView | RestingView;

const graveyardShift = findRoutine('graveyard-shift');
if (graveyardShift === undefined) throw new Error('Graveyard Shift is missing from the Catalog');

/** A started Workout of Graveyard Shift at clock `startAt`. */
function started(startAt = 0): Workout {
  return startWorkout(graveyardShift as NonNullable<typeof graveyardShift>, startAt);
}

/** Wait out a seconds Set, then confirm the current Set. */
function confirmCurrent(workout: Workout, at: number): { workout: Workout; at: number } {
  const view = workoutView(advance(workout, at));
  const when = view.phase === 'exercising' && view.timer.kind === 'seconds'
    ? at + view.timer.remainingMs
    : at;
  return { workout: confirmSet(workout, when), at: when };
}

/** The pause kinds under test. */
const pauseKinds = { user: pauseWorkout, auto: autoPause } as const;

/** A paused-time plan: waits spent on `advance` inside the pause, plus a tail. */
const pausePlanArbitrary = fc.record({
  advances: fc.array(fc.integer({ min: 0, max: 700_000 }), { maxLength: 8 }),
  tailMs: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 700_000 })),
});

/** A Workout in `exercising` or `resting` reached by a random script, with the player's clock. */
const runningWorkoutArbitrary = fc
  .record({
    routine: routineArbitrary,
    startAt: fc.integer({ min: 0, max: 1_000_000 }),
    script: commandScriptArbitrary(),
    // Extra wait after the script, so a Rest may already be due at the pause.
    gap: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 700_000 })),
  })
  .map(({ routine, startAt, script, gap }) => {
    const run = playScript(routine, startAt, script);
    return { workout: run.workout, clock: run.clock + gap };
  })
  .filter(({ workout, clock }) => {
    const phase = workoutView(advance(workout, clock)).phase;
    return phase === 'exercising' || phase === 'resting';
  });

describe('Pausing a Workout', () => {
  // Feature: skip-pause-quit, Property 1: Pause then resume leaves timers unchanged
  it('pause then resume leaves the phase, the Set and the timers as they were', () => {
    // **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.8, 5.1, 5.3**
    fc.assert(
      fc.property(
        runningWorkoutArbitrary,
        fc.constantFrom('user', 'auto' as const),
        pausePlanArbitrary,
        ({ workout, clock }, kind, plan) => {
          // What the user sees just before the pause, with a due Rest already over.
          const before = workoutView(advance(workout, clock)) as Frozen;

          const paused = pauseKinds[kind](workout, clock);
          const pausedView = workoutView(paused);
          expect(pausedView.phase).toBe('paused');
          if (pausedView.phase !== 'paused') return;
          expect(pausedView.cause).toBe(kind);
          expect(pausedView.held).toEqual(before);

          // Any number of advances inside the pause change nothing.
          let held = paused;
          let at = clock;
          for (const byMs of plan.advances) {
            at += byMs;
            held = advance(held, at);
            const during = workoutView(held);
            expect(during.phase).toBe('paused');
            if (during.phase === 'paused') expect(during.held).toEqual(before);
          }

          at += plan.tailMs;
          const resumed = workoutView(resumeWorkout(held, at));
          expect(resumed).toEqual(before);
        },
      ),
      { numRuns: 200 },
    );
  });

  // Feature: skip-pause-quit, Property 2: A user pause is not replaced by an Auto_Pause
  it('an Auto_Pause never replaces a user pause, and an auto pause behaves like it', () => {
    // **Validates: Requirements 5.1, 5.2, 5.3, 4.6**
    fc.assert(
      fc.property(
        runningWorkoutArbitrary,
        fc.constantFrom('user', 'auto' as const),
        pausePlanArbitrary,
        ({ workout, clock }, kind, plan) => {
          const before = workoutView(advance(workout, clock)) as Frozen;
          const paused = pauseKinds[kind](workout, clock);

          let held = paused;
          let at = clock;
          for (const byMs of plan.advances) {
            at += byMs;
            held = advance(held, at);
            // Whichever pause it is, a second pause of either kind changes nothing.
            expect(autoPause(held, at)).toBe(held);
            expect(pauseWorkout(held, at)).toBe(held);
            const during = workoutView(held);
            expect(during.phase).toBe('paused');
            if (during.phase === 'paused') {
              expect(during.cause).toBe(kind);
              expect(during.held).toEqual(before);
            }
          }

          // Only the resume command ends the pause, and the timers are as before.
          at += plan.tailMs;
          expect(autoPause(held, at)).toBe(held);
          expect(workoutView(resumeWorkout(held, at))).toEqual(before);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('Pause examples on Graveyard Shift', () => {
  it('pausing freezes the Set_Timer and the Rest_Timer', () => {
    // A Rest: confirm the first Set, then pause 1 s into the Rest.
    const first = confirmCurrent(started(0), 1_000);
    const resting = workoutView(first.workout);
    expect(resting.phase).toBe('resting');
    if (resting.phase !== 'resting') return;
    const pausedAt = first.at + 1_000;
    const paused = pauseWorkout(first.workout, pausedAt);
    const frozen = workoutView(advance(paused, pausedAt + 500_000));
    expect(frozen.phase).toBe('paused');
    if (frozen.phase !== 'paused' || frozen.held.phase !== 'resting') return;
    expect(frozen.held.restRemainingMs).toBe(Math.max(0, resting.restRemainingMs - 1_000));
  });

  it('resuming continues from the same point', () => {
    const first = confirmCurrent(started(0), 1_000);
    const pausedAt = first.at + 1_000;
    const justBefore = workoutView(advance(first.workout, pausedAt));
    const paused = pauseWorkout(first.workout, pausedAt);
    const resumed = workoutView(resumeWorkout(paused, pausedAt + 123_456));
    expect(resumed).toEqual(justBefore);
  });

  it('Auto_Pause freezes the timers and needs the resume command', () => {
    const first = confirmCurrent(started(0), 1_000);
    const pausedAt = first.at + 1_000;
    const justBefore = workoutView(advance(first.workout, pausedAt));
    const paused = autoPause(first.workout, pausedAt);
    const later = advance(paused, pausedAt + 900_000);
    const view = workoutView(later);
    expect(view.phase).toBe('paused');
    if (view.phase === 'paused') expect(view.cause).toBe('auto');
    expect(workoutView(resumeWorkout(later, pausedAt + 900_000))).toEqual(justBefore);
  });

  it('Auto_Pause does not replace a user pause', () => {
    const w = started(0);
    const userPaused = pauseWorkout(w, 5_000);
    expect(autoPause(userPaused, 9_000)).toBe(userPaused);
    const view = workoutView(userPaused);
    expect(view.phase === 'paused' && view.cause).toBe('user');
  });

  it('a pause after the Rest was due pauses on the next Set', () => {
    const first = confirmCurrent(started(0), 1_000);
    const resting = workoutView(first.workout);
    expect(resting.phase).toBe('resting');
    if (resting.phase !== 'resting') return;
    const pausedAt = first.at + resting.restRemainingMs + 5_000;
    const view = workoutView(pauseWorkout(first.workout, pausedAt));
    expect(view.phase).toBe('paused');
    if (view.phase !== 'paused') return;
    expect(view.held.phase).toBe('exercising');
    if (view.held.phase === 'exercising') expect(view.held.position).toBe(resting.nextPosition);
  });

  it('paused time is not Active_Time', () => {
    const paused = pauseWorkout(started(1_000), 6_000);
    const resumed = resumeWorkout(paused, 16_000);
    const view = workoutView(quitWorkout(resumed, 20_000));
    expect(view.phase).toBe('summary');
    // 20 000 - 1 000 - 10 000 paused.
    if (view.phase === 'summary') expect(view.activeMs).toBe(9_000);
  });
});
