import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { findRoutine } from '@/catalog';
import type { RoutineEntry } from '@/catalog';
import {
  advance,
  autoPause,
  candyFor,
  confirmSet,
  pauseWorkout,
  quitWorkout,
  resumeWorkout,
  skipRest,
  skipSet,
  startWorkout,
  workoutView,
} from '@/workout-engine';
import type { Workout } from '@/workout-engine';
import { scriptRunArbitrary, slotCount } from './support/workout';

const found = findRoutine('graveyard-shift');
if (found === undefined) throw new Error('Graveyard Shift is missing from the Catalog');
const graveyardShift: RoutineEntry = found;

/** Confirm the current Set, waiting out a Rest or a Set_Timer first. Returns the new clock. */
function confirmNext(workout: Workout, clock: number): { workout: Workout; clock: number } {
  let now = clock;
  let w = advance(workout, now);
  let view = workoutView(w);
  if (view.phase === 'resting') {
    now += view.restRemainingMs;
    w = advance(w, now);
    view = workoutView(w);
  }
  if (view.phase !== 'exercising') throw new Error('expected an exercising Workout');
  if (view.timer.kind === 'seconds') now += view.timer.remainingMs;
  return { workout: confirmSet(w, now), clock: now };
}

function confirmSets(count: number): { workout: Workout; clock: number } {
  let state = { workout: startWorkout(graveyardShift, 0), clock: 0 };
  for (let i = 0; i < count; i += 1) state = confirmNext(state.workout, state.clock + 1000);
  return state;
}

describe('quitting a Workout', () => {
  // Feature: skip-pause-quit, Property 7: Quitting gives abandoned and keeps per-Set Candy
  // **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 7.9**
  it('gives abandoned and keeps per-Set Candy with no bonus, whatever the phase', () => {
    fc.assert(
      fc.property(
        scriptRunArbitrary,
        fc.integer({ min: 0, max: 700_000 }),
        (run, extra) => {
          const before = run.workout;
          fc.pre(before.phase !== 'summary');
          const total = slotCount(run.routine);
          const quitAt = run.clock + extra;

          const quit = quitWorkout(before, quitAt);
          const view = workoutView(quit);
          expect(view.phase).toBe('summary');
          if (view.phase !== 'summary') return;

          expect(view.outcome).toBe('abandoned');
          expect(view.setsConfirmed).toBe(before.confirmed.length);
          expect(view.candyEarned).toBe(before.confirmed.length);
          expect(view.candyEarned).toBe(candyFor(before.confirmed.length, total));
          expect(view.bonusIncluded).toBe(false);
          expect(view.setsSkipped).toBe(before.skipped.length);
          expect(view.setsNotReached).toBe(
            total - before.confirmed.length - before.skipped.length,
          );

          // A paused Workout ends its Active_Time at the pause.
          if (before.phase === 'paused' && before.pause !== null) {
            expect(quit.finishedAt).toBe(before.pause.at);
          } else {
            expect(quit.finishedAt).toBe(Math.max(quitAt, before.clock));
          }

          // Every later command returns the same summary.
          const later = quitAt + 5000;
          for (const next of [
            quitWorkout(quit, later),
            confirmSet(quit, later, 5),
            skipSet(quit, later),
            skipRest(quit, later),
            pauseWorkout(quit, later),
            autoPause(quit, later),
            resumeWorkout(quit, later),
            advance(quit, later),
          ]) {
            expect(next).toBe(quit);
            expect(workoutView(next)).toEqual(view);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('quitting gives abandoned and keeps per-Set Candy without bonus', () => {
    const { workout, clock } = confirmSets(3);
    const view = workoutView(quitWorkout(workout, clock + 1000));
    expect(view.phase).toBe('summary');
    if (view.phase !== 'summary') return;
    expect(view.outcome).toBe('abandoned');
    expect(view.setsConfirmed).toBe(3);
    expect(view.candyEarned).toBe(3);
    expect(view.setsSkipped).toBe(0);
    expect(view.setsNotReached).toBe(6);
    expect(view.bonusIncluded).toBe(false);
  });

  it('quitting from the final Set gives abandoned', () => {
    const total = slotCount(graveyardShift);
    const { workout, clock } = confirmSets(total - 1);
    // Wait out any Rest so the final Set is the current one.
    const at = clock + 600_000;
    const current = workoutView(advance(workout, at));
    expect(current.phase === 'exercising' ? current.position : null).toBe(total);
    const view = workoutView(quitWorkout(workout, at));
    expect(view.phase).toBe('summary');
    if (view.phase !== 'summary') return;
    expect(view.outcome).toBe('abandoned');
    expect(view.candyEarned).toBe(total - 1);
    expect(view.bonusIncluded).toBe(false);
    expect(view.setsNotReached).toBe(1);
  });

  it('quitting from a pause ends Active_Time at the pause', () => {
    let w = startWorkout(graveyardShift, 0);
    w = pauseWorkout(w, 20_000);
    expect(w.phase).toBe('paused');
    const view = workoutView(quitWorkout(w, 50_000));
    expect(view.phase).toBe('summary');
    if (view.phase !== 'summary') return;
    expect(view.outcome).toBe('abandoned');
    expect(view.activeMs).toBe(20_000);
  });

  it('quitting with 0 confirmed Sets earns 0 Candy', () => {
    const view = workoutView(quitWorkout(startWorkout(graveyardShift, 0), 4000));
    expect(view.phase).toBe('summary');
    if (view.phase !== 'summary') return;
    expect(view.outcome).toBe('abandoned');
    expect(view.candyEarned).toBe(0);
    expect(view.setsConfirmed).toBe(0);
    expect(view.setsNotReached).toBe(9);
  });
});
