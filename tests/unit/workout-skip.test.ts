import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { findRoutine } from '@/catalog';
import type { RoutineEntry } from '@/catalog';
import {
  advance,
  confirmSet,
  skipRest,
  skipSet,
  startWorkout,
  workoutView,
} from '@/workout-engine';
import type { Workout } from '@/workout-engine';

import { playScript, routineArbitrary } from './support/workout';
import type { ScriptKind, ScriptStep } from './support/workout';

const found = findRoutine('graveyard-shift');
if (found === undefined) throw new Error('Graveyard Shift is missing from the Catalog');
const graveyardShift: RoutineEntry = found;

/** Confirm the current Set, waiting out a seconds target first. Returns the Workout and clock. */
function confirmNext(w: Workout, clock: number): { workout: Workout; clock: number } {
  let at = clock;
  const view = workoutView(advance(w, at));
  if (view.phase === 'exercising' && view.timer.kind === 'seconds') at += view.timer.remainingMs;
  return { workout: confirmSet(w, at), clock: at };
}

/** Confirm every remaining Set, waiting out each Rest, until the summary. */
function confirmRest(w: Workout, clock: number): { workout: Workout; clock: number } {
  let state = { workout: w, clock };
  for (let guard = 0; guard < 100; guard += 1) {
    const view = workoutView(advance(state.workout, state.clock));
    if (view.phase === 'summary') return state;
    if (view.phase === 'resting') {
      state = { workout: advance(state.workout, state.clock + view.restRemainingMs), clock: state.clock + view.restRemainingMs };
      continue;
    }
    state = confirmNext(state.workout, state.clock);
  }
  throw new Error('Workout did not end');
}

const stepKinds: readonly ScriptKind[] = ['confirm', 'skipSet', 'skipRest', 'pause', 'autoPause', 'resume', 'advance'];

/** Short scripts without a quit, with small waits so Sets and Rests are both often current. */
const scriptArbitrary: fc.Arbitrary<readonly ScriptStep[]> = fc.array(
  fc.record({
    kind: fc.constantFrom(...stepKinds),
    wait: fc.integer({ min: 0, max: 40_000 }),
    reps: fc.integer({ min: 0, max: 200 }),
  }),
  { maxLength: 20 },
);

const probeArbitrary = fc.record({
  routine: routineArbitrary,
  startAt: fc.integer({ min: 0, max: 1_000_000 }),
  script: scriptArbitrary,
  /** Time after the script at which the skip arrives. */
  extra: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 700_000 })),
});

describe('skipping a Set', () => {
  it('a skipped Set earns nothing and starts the next Set at once', () => {
    // Feature: skip-pause-quit, Property 3: A skipped Set earns nothing and starts the next Set at once
    let applicable = 0;
    fc.assert(
      fc.property(probeArbitrary, ({ routine, startAt, script, extra }) => {
        const run = playScript(routine, startAt, script);
        const at = run.clock + extra;
        const w = run.workout;
        const held = advance(w, at);
        if (held.phase !== 'exercising') {
          expect(skipSet(w, at)).toBe(w);
          return;
        }
        applicable += 1;
        const before = workoutView(held);
        if (before.phase !== 'exercising') throw new Error('expected an exercising view');

        const result = skipSet(w, at);
        const view = workoutView(result);

        // Nothing is earned and nothing is confirmed.
        expect(result.confirmed).toEqual(w.confirmed);
        expect(view.candyEarned).toBe(before.candyEarned);
        // The Set is recorded as skipped, once, and not as confirmed.
        expect(result.skipped).toEqual([...w.skipped, held.index]);
        expect(view.results[held.index]).toBe('skipped');
        expect(result.confirmed.some((c) => c.slotIndex === held.index)).toBe(false);

        if (held.index < held.slots.length - 1) {
          // The next Set starts at once: no Rest, full Set_Timer.
          expect(view.phase).toBe('exercising');
          if (view.phase !== 'exercising') return;
          expect(view.position).toBe(before.position + 1);
          if (view.timer.kind === 'seconds') {
            expect(view.timer.remainingMs).toBe(view.timer.targetSeconds * 1000);
          }
        } else {
          expect(view.phase).toBe('summary');
          if (view.phase !== 'summary') return;
          expect(view.outcome).toBe('partial');
          expect(view.setsSkipped).toBe(w.skipped.length + 1);
          expect(view.bonusIncluded).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
    expect(applicable).toBeGreaterThan(0);
  });

  it('skipping a Set earns 0 Candy', () => {
    const w = skipSet(startWorkout(graveyardShift, 0), 1000);
    expect(workoutView(w).candyEarned).toBe(0);
    expect(w.confirmed).toHaveLength(0);
    expect(w.skipped).toEqual([0]);
  });

  it('a Skipped_Set removes the Completion_Bonus', () => {
    const skipped = skipSet(startWorkout(graveyardShift, 0), 1000);
    const end = confirmRest(skipped, 1000);
    const view = workoutView(end.workout);
    expect(view.phase).toBe('summary');
    if (view.phase !== 'summary') return;
    expect(view.setsConfirmed).toBe(8);
    expect(view.setsSkipped).toBe(1);
    expect(view.candyEarned).toBe(8);
    expect(view.bonusIncluded).toBe(false);
    expect(view.outcome).toBe('partial');
  });

  it('skipping the final Set gives partial', () => {
    let state = { workout: startWorkout(graveyardShift, 0), clock: 0 };
    for (let i = 0; i < 8; i += 1) {
      state = confirmNext(state.workout, state.clock);
      const view = workoutView(state.workout);
      if (view.phase === 'resting') {
        state = {
          workout: advance(state.workout, state.clock + view.restRemainingMs),
          clock: state.clock + view.restRemainingMs,
        };
      }
    }
    const last = workoutView(state.workout);
    expect(last.phase).toBe('exercising');
    if (last.phase !== 'exercising') return;
    expect(last.position).toBe(9);

    const view = workoutView(skipSet(state.workout, state.clock + 1000));
    expect(view.phase).toBe('summary');
    if (view.phase !== 'summary') return;
    expect(view.outcome).toBe('partial');
    expect(view.candyEarned).toBe(8);
    expect(view.setsSkipped).toBe(1);
  });

  it('a skipped Set starts the next Set with no Rest', () => {
    const view = workoutView(skipSet(startWorkout(graveyardShift, 0), 1000));
    expect(view.phase).toBe('exercising');
    if (view.phase !== 'exercising') return;
    expect(view.position).toBe(2);
  });

  it('a skip that arrives after the Rest was due applies to the next Set', () => {
    const resting = confirmSet(startWorkout(graveyardShift, 0), 1000);
    const restView = workoutView(resting);
    expect(restView.phase).toBe('resting');
    if (restView.phase !== 'resting') return;
    const late = 1000 + restView.restRemainingMs + 5000;

    // The Rest is over: skip Rest is rejected, and skip Set skips the second Set.
    expect(skipRest(resting, late)).toBe(resting);
    const w = skipSet(resting, late);
    expect(w.skipped).toEqual([1]);
    const view = workoutView(w);
    expect(view.phase).toBe('exercising');
    if (view.phase !== 'exercising') return;
    expect(view.position).toBe(3);
    expect(view.candyEarned).toBe(1);
  });
});

describe('skipping a Rest', () => {
  it('skipping a Rest starts the next Set and changes no count', () => {
    // Feature: skip-pause-quit, Property 4: Skipping a Rest starts the next Set and changes no count
    let applicable = 0;
    fc.assert(
      fc.property(probeArbitrary, ({ routine, startAt, script, extra }) => {
        // End the script on a confirm so a Rest is often current.
        const run = playScript(routine, startAt, [...script, { kind: 'confirm', wait: 0, reps: 10 }]);
        const at = run.clock + (extra % 650_000);
        const w = run.workout;
        const held = advance(w, at);
        if (held.phase !== 'resting') {
          // Outside a Rest the command is rejected.
          expect(skipRest(w, at)).toBe(w);
          return;
        }
        applicable += 1;
        const before = workoutView(held);
        if (before.phase !== 'resting') throw new Error('expected a resting view');

        const result = skipRest(w, at);
        const view = workoutView(result);

        expect(view.phase).toBe('exercising');
        if (view.phase !== 'exercising') return;
        // The next Set starts at once with its full timer.
        expect(view.position).toBe(before.nextPosition);
        expect(view.slot).toEqual(before.next);
        if (view.timer.kind === 'seconds') {
          expect(view.timer.remainingMs).toBe(view.timer.targetSeconds * 1000);
        }
        // No count changes.
        expect(result.confirmed).toEqual(w.confirmed);
        expect(result.skipped).toEqual(w.skipped);
        expect(view.candyEarned).toBe(before.candyEarned);
        expect(view.results).toEqual(before.results);
        expect(result.pausedMs).toBe(w.pausedMs);
      }),
      { numRuns: 200 },
    );
    expect(applicable).toBeGreaterThan(0);
  });

  it('skipping a Rest starts the next Set at once and counts the Rest time already spent', () => {
    const resting = confirmSet(startWorkout(graveyardShift, 0), 1000);
    const restView = workoutView(resting);
    expect(restView.phase).toBe('resting');
    if (restView.phase !== 'resting') return;

    const skippedAt = 11_000;
    expect(skippedAt - 1000).toBeLessThan(restView.restRemainingMs);
    const w = skipRest(resting, skippedAt);
    const view = workoutView(w);
    expect(view.phase).toBe('exercising');
    if (view.phase !== 'exercising') return;
    expect(view.position).toBe(2);
    expect(view.candyEarned).toBe(1);

    const end = confirmRest(w, skippedAt);
    const summary = workoutView(end.workout);
    expect(summary.phase).toBe('summary');
    if (summary.phase !== 'summary') return;
    // Active_Time runs on the clock, so the 10 s of Rest already spent are inside it.
    expect(summary.activeMs).toBe(end.clock);
    expect(end.clock).toBeGreaterThanOrEqual(skippedAt);
  });
});
