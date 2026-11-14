import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { findRoutine } from '@/catalog';
import type { RoutineEntry } from '@/catalog';
import {
  advance,
  candyFor,
  confirmSet,
  pauseWorkout,
  resumeWorkout,
  skipSet,
  startWorkout,
  workoutView,
} from '@/workout-engine';
import type { ExercisingView, RestingView, Workout, WorkoutView } from '@/workout-engine';
import {
  commandScriptArbitrary,
  playScript,
  routineArbitrary,
  slotCount,
} from './support/workout';
import type { ScriptRun, ScriptStep } from './support/workout';

const found = findRoutine('graveyard-shift');
if (found === undefined) throw new Error('Graveyard Shift is missing from the Catalog');
const graveyardShift: RoutineEntry = found;

/** Steps that resolve every remaining Set: resume, skip any Rest, then confirm or skip. */
const resolveAllTail: fc.Arbitrary<readonly ScriptStep[]> = fc
  .array(
    fc.record({
      kind: fc.constantFrom('confirm' as const, 'skipSet' as const),
      reps: fc.integer({ min: 0, max: 200 }),
    }),
    { minLength: 70, maxLength: 70 },
  )
  .map((resolvers) =>
    resolvers.flatMap(({ kind, reps }): ScriptStep[] => [
      { kind: 'resume', wait: 0, reps: 0 },
      { kind: 'skipRest', wait: 0, reps: 0 },
      { kind, wait: 0, reps },
    ]),
  );

/** A random script, then a tail that resolves every Set. `allowQuit` false turns a quit into a wait. */
function endingScriptRun(allowQuit: boolean): fc.Arbitrary<ScriptRun> {
  return fc
    .record({
      routine: routineArbitrary,
      startAt: fc.integer({ min: 0, max: 1_000_000 }),
      head: commandScriptArbitrary(60),
      tail: resolveAllTail,
    })
    .map(({ routine, startAt, head, tail }) => {
      const safeHead = allowQuit
        ? head
        : head.map((step): ScriptStep => (step.kind === 'quit' ? { ...step, kind: 'advance' } : step));
      return playScript(routine, startAt, [...safeHead, ...tail]);
    });
}

/** Every prefix of a short script, played on a Routine_Entry. */
function prefixRuns(run: {
  routine: RoutineEntry;
  startAt: number;
  script: readonly ScriptStep[];
}): ScriptRun[] {
  const runs: ScriptRun[] = [];
  for (let k = 0; k <= run.script.length; k += 1) {
    runs.push(playScript(run.routine, run.startAt, run.script.slice(0, k)));
  }
  return runs;
}

const shortScriptArbitrary = fc.record({
  routine: routineArbitrary,
  startAt: fc.integer({ min: 0, max: 1_000_000 }),
  script: commandScriptArbitrary(40),
});

/** The timed view of a running Workout, looking through a pause. */
function runningView(view: WorkoutView): ExercisingView | RestingView | null {
  if (view.phase === 'paused') return view.held;
  if (view.phase === 'exercising' || view.phase === 'resting') return view;
  return null;
}

/** Confirm the current Set, waiting out any Rest and Set_Timer first. */
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

describe('resolved Sets, outcome and Candy', () => {
  // Feature: skip-pause-quit, Property 6: Resolved Sets, outcome and Candy
  // **Validates: Requirements 2.6, 6.5, 7.1, 7.2, 7.3, 7.7, 7.8**
  it('a Workout that ends without a quit resolves every Set and sets the outcome by skips', () => {
    fc.assert(
      fc.property(endingScriptRun(false), (run) => {
        const total = slotCount(run.routine);
        const view = workoutView(run.workout);
        expect(view.phase).toBe('summary');
        if (view.phase !== 'summary') return;

        expect(view.setsConfirmed + view.setsSkipped).toBe(total);
        expect(view.setsNotReached).toBe(0);
        expect(view.outcome).toBe(view.setsSkipped === 0 ? 'completed' : 'partial');

        const confirmedSlots = run.workout.confirmed.map((c) => c.slotIndex);
        const overlap = run.workout.skipped.filter((i) => confirmedSlots.includes(i));
        expect(overlap).toEqual([]);

        const allConfirmed = view.setsConfirmed === total;
        expect(view.candyEarned).toBe(view.setsConfirmed + (allConfirmed ? 5 : 0));
        expect(view.bonusIncluded).toBe(allConfirmed);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: skip-pause-quit, Property 6: Resolved Sets, outcome and Candy
  // **Validates: Requirements 6.5, 7.3, 7.9**
  it('at every step the Candy follows the confirmed Sets and an unended Workout is running or paused', () => {
    fc.assert(
      fc.property(shortScriptArbitrary, (input) => {
        const total = slotCount(input.routine);
        for (const run of prefixRuns(input)) {
          const view = workoutView(run.workout);
          expect(view.candyEarned).toBe(candyFor(run.workout.confirmed.length, total));
          if (run.workout.outcome === null) {
            expect(['exercising', 'resting', 'paused']).toContain(view.phase);
          } else {
            expect(view.phase).toBe('summary');
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('one skipped Set and eight confirmed give 8 Candy and partial', () => {
    let w = startWorkout(graveyardShift, 0);
    w = skipSet(w, 1000);
    let clock = 1000;
    for (let i = 0; i < 8; i += 1) {
      const next = confirmNext(w, clock + 1000);
      w = next.workout;
      clock = next.clock;
    }
    const view = workoutView(w);
    expect(view.phase).toBe('summary');
    if (view.phase !== 'summary') return;
    expect(view.outcome).toBe('partial');
    expect(view.setsConfirmed).toBe(8);
    expect(view.setsSkipped).toBe(1);
    expect(view.setsNotReached).toBe(0);
    expect(view.candyEarned).toBe(8);
    expect(view.bonusIncluded).toBe(false);
  });

  it('every Set confirmed after a pause gives completed with 14 Candy', () => {
    let w = startWorkout(graveyardShift, 0);
    w = pauseWorkout(w, 5000);
    w = resumeWorkout(w, 65_000);
    let clock = 65_000;
    for (let i = 0; i < 9; i += 1) {
      const next = confirmNext(w, clock + 1000);
      w = next.workout;
      clock = next.clock;
    }
    const view = workoutView(w);
    expect(view.phase).toBe('summary');
    if (view.phase !== 'summary') return;
    expect(view.outcome).toBe('completed');
    expect(view.setsConfirmed).toBe(9);
    expect(view.setsSkipped).toBe(0);
    expect(view.candyEarned).toBe(14);
    expect(view.bonusIncluded).toBe(true);
  });
});

describe('Active_Time', () => {
  // Feature: skip-pause-quit, Property 8: Active_Time excludes paused time
  // **Validates: Requirements 3.5, 6.4, 7.6**
  it('is the span of the Workout minus its paused time', () => {
    fc.assert(
      fc.property(endingScriptRun(true), (run) => {
        const view = workoutView(run.workout);
        expect(view.phase).toBe('summary');
        if (view.phase !== 'summary') return;

        const last = run.accepted[run.accepted.length - 1];
        if (last === undefined) throw new Error('a Workout in the summary accepted a command');
        // A quit from a pause ends at the pause; the open span adds no time.
        const open = run.pausedSpans.find((span) => span.end === null);
        const endClock = open !== undefined ? open.start : last.at;
        const pausedTotal = run.pausedSpans.reduce(
          (sum, span) => sum + (span.end === null ? 0 : span.end - span.start),
          0,
        );

        expect(view.activeMs).toBe(endClock - run.startAt - pausedTotal);
        expect(view.activeMs).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: skip-pause-quit, Property 8: Active_Time excludes paused time
  // **Validates: Requirements 3.5, 7.6**
  it('keeps the Set_Timer and the Rest_Timer within their targets at every step', () => {
    fc.assert(
      fc.property(shortScriptArbitrary, (input) => {
        for (const run of prefixRuns(input)) {
          const timed = runningView(workoutView(run.workout));
          if (timed === null) continue;
          if (timed.phase === 'exercising' && timed.timer.kind === 'seconds') {
            expect(timed.timer.remainingMs).toBeGreaterThanOrEqual(0);
            expect(timed.timer.remainingMs).toBeLessThanOrEqual(timed.timer.targetSeconds * 1000);
          }
          if (timed.phase === 'resting') {
            const slot = run.workout.slots[run.workout.index];
            if (slot === undefined) throw new Error('resting Workout has no current slot');
            expect(timed.restRemainingMs).toBeGreaterThanOrEqual(0);
            expect(timed.restRemainingMs).toBeLessThanOrEqual(slot.restSeconds * 1000);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('Set results', () => {
  // Feature: skip-pause-quit, Property 9: Set results describe every Set in order
  // **Validates: Requirements 7.4, 7.5**
  it('describe every Set in order', () => {
    fc.assert(
      fc.property(shortScriptArbitrary, (input) => {
        const total = slotCount(input.routine);
        for (const run of prefixRuns(input)) {
          const view = workoutView(run.workout);
          const confirmed = run.workout.confirmed.map((c) => c.slotIndex);
          const skipped = run.workout.skipped;

          expect(view.results).toHaveLength(total);
          view.results.forEach((result, i) => {
            if (confirmed.includes(i)) expect(result).toBe('confirmed');
            else if (skipped.includes(i)) expect(result).toBe('skipped');
            else if (view.phase === 'summary' && view.outcome === 'abandoned') {
              expect(result).toBe('notReached');
            } else expect(result).toBe('pending');
          });

          // Resolved Sets come first, in order, with no gap.
          const resolved = [...confirmed, ...skipped].sort((a, b) => a - b);
          expect(resolved).toEqual(resolved.map((_, i) => i));

          if (view.phase === 'summary') {
            expect(view.results.filter((r) => r === 'confirmed')).toHaveLength(view.setsConfirmed);
            expect(view.results.filter((r) => r === 'skipped')).toHaveLength(view.setsSkipped);
            expect(view.results.filter((r) => r === 'notReached')).toHaveLength(
              view.setsNotReached,
            );
            if (view.outcome !== 'abandoned') expect(view.results).not.toContain('notReached');
          } else {
            expect(view.results).not.toContain('notReached');
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
