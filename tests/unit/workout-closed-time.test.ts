/**
 * Closed time never counts: a restored Workout is rebased onto the restore
 * clock, so the time the page was closed adds nothing. Every clock value is an
 * argument; no real time is read and no fake timers are used.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { exercises, stretches } from '@/catalog';
import type { RoutineEntry } from '@/catalog';
import {
  advance,
  checkpointOf,
  confirmSet,
  quitWorkout,
  restoreWorkout,
  resumeWorkout,
  startWorkout,
  workoutView,
} from '@/workout-engine';
import type { Workout } from '@/workout-engine';
import { unfinishedWorkoutArbitrary } from './support/workout';

/** The Workout's Freeze_Instant: the pause instant while paused, else its latest clock. */
function freezeInstant(w: Workout): number {
  return w.phase === 'paused' && w.pause !== null ? w.pause.at : w.clock;
}

/** The original's Active_Time at its Freeze_Instant. */
function activeAtFreeze(w: Workout): number {
  const view = workoutView(quitWorkout(w, freezeInstant(w)));
  if (view.phase !== 'summary') throw new Error('quit must reach the summary');
  return view.activeMs;
}

function restored(routine: RoutineEntry, w: Workout, at: number): Workout {
  const result = restoreWorkout(checkpointOf(w), routine, at);
  if (result === null) throw new Error('a reachable checkpoint must restore');
  return result;
}

const clockArbitrary = fc.integer({ min: 0, max: 10_000_000 });
const spanArbitrary = fc.integer({ min: 0, max: 100_000_000 });

describe('closed time never counts', () => {
  it('two restore clocks give equal held views', () => {
    // Feature: resume-after-refresh, Property 3: Closed time never counts
    fc.assert(
      fc.property(unfinishedWorkoutArbitrary, clockArbitrary, clockArbitrary, ({ routine, workout }, at1, at2) => {
        const first = workoutView(restored(routine, workout, at1));
        const second = workoutView(restored(routine, workout, at2));
        expect(first).toEqual(second);
      }),
      { numRuns: 200 },
    );
  });

  it('advancing a restored Workout leaves its view unchanged', () => {
    // Feature: resume-after-refresh, Property 3: Closed time never counts
    fc.assert(
      fc.property(unfinishedWorkoutArbitrary, clockArbitrary, spanArbitrary, ({ routine, workout }, at, by) => {
        const r = restored(routine, workout, at);
        expect(workoutView(advance(r, at + by))).toEqual(workoutView(r));
      }),
      { numRuns: 200 },
    );
  });

  it('resuming after any delay and running for d adds exactly d to the Active_Time', () => {
    // Feature: resume-after-refresh, Property 3: Closed time never counts
    fc.assert(
      fc.property(
        unfinishedWorkoutArbitrary,
        clockArbitrary,
        spanArbitrary,
        spanArbitrary,
        ({ routine, workout }, at, r, d) => {
          const before = activeAtFreeze(workout);
          const running = resumeWorkout(restored(routine, workout, at), at + r);
          const summary = workoutView(quitWorkout(running, at + r + d));
          expect(summary.phase).toBe('summary');
          if (summary.phase !== 'summary') return;
          expect(summary.activeMs).toBe(before + d);
        },
      ),
      { numRuns: 200 },
    );
  });
});

const exercise = exercises[0];
const stretch = stretches[0];
if (exercise === undefined || stretch === undefined) throw new Error('the Catalog is empty');

const restRoutine: RoutineEntry = {
  id: 'closed-time-routine',
  slug: 'closed-time-routine',
  nameId: 'routine.title',
  steps: [{ entryId: exercise.id, sets: 2, target: exercise.target, restSeconds: 30 }],
  coolDown: [{ entryId: stretch.id, sets: 1, target: stretch.target, restSeconds: 0 }],
};

/** A Workout resting with 12 s left at clock 19 000. */
function restingWithTwelveSeconds(): Workout {
  const started = startWorkout(restRoutine, 0);
  const resting = confirmSet(started, 1_000, 5);
  return advance(resting, 19_000);
}

function restRemaining(w: Workout): number {
  const view = workoutView(w);
  const held = view.phase === 'paused' ? view.held : view;
  if (held.phase !== 'resting') throw new Error('expected a Rest');
  return held.restRemainingMs;
}

describe('closed time examples', () => {
  it('a Rest with 12 s left restores with 12 s left and resumes with 12 s left', () => {
    const original = restingWithTwelveSeconds();
    expect(restRemaining(original)).toBe(12_000);
    const r = restored(restRoutine, original, 5_000_000);
    expect(restRemaining(r)).toBe(12_000);
    const running = resumeWorkout(r, 9_000_000);
    expect(running.phase).toBe('resting');
    expect(restRemaining(running)).toBe(12_000);
  });

  it('an hour of closed time adds no Active_Time', () => {
    const original = restingWithTwelveSeconds();
    const before = activeAtFreeze(original);
    const hour = 3_600_000;
    const running = resumeWorkout(restored(restRoutine, original, 100_000), 100_000 + hour);
    const summary = workoutView(quitWorkout(running, 100_000 + hour));
    expect(summary.phase === 'summary' && summary.activeMs).toBe(before);
  });

  it('a Rest does not end while the Workout is restored', () => {
    const original = restingWithTwelveSeconds();
    const r = restored(restRoutine, original, 100_000);
    const later = advance(r, 100_000 + 3_600_000);
    const view = workoutView(later);
    expect(view.phase).toBe('paused');
    expect(restRemaining(later)).toBe(12_000);
  });
});
