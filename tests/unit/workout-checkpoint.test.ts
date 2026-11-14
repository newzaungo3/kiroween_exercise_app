import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { stretches } from '@/catalog';
import type { RoutineEntry } from '@/catalog';
import {
  advance,
  checkpointOf,
  confirmSet,
  pauseWorkout,
  restoreWorkout,
  startWorkout,
  workoutView,
} from '@/workout-engine';
import type { Workout } from '@/workout-engine';
import { unfinishedWorkoutArbitrary } from './support/workout';

/** Any finite clock value, including negative and small ones. */
const restoreClockArbitrary = fc.oneof(
  fc.integer({ min: -1_000_000, max: 10_000_000 }),
  fc.double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true }),
);

/** The view of the frozen phase: the held view of a paused Workout, else its own view. */
function frozenView(w: Workout) {
  const view = workoutView(w);
  return view.phase === 'paused' ? view.held : view;
}

/** Rebasing adds and subtracts fractional clocks; compare times to a nanosecond of a second. */
function roundTimes(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, v: unknown) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v)),
  ) as unknown;
}

function stretchRoutine(seconds: number): RoutineEntry {
  const stretch = stretches[0];
  if (stretch === undefined) throw new Error('Catalog has no Stretch');
  const step = { entryId: stretch.id, sets: 1, target: { seconds }, restSeconds: 0 };
  return {
    id: 'stretch-only',
    slug: 'stretch-only',
    nameId: 'routine.title',
    steps: [step],
    coolDown: [step],
  };
}

describe('checkpoint and restore', () => {
  it('a checkpoint survives a JSON round trip and restores', () => {
    // Feature: resume-after-refresh, Property 1: Checkpoint round trip
    // **Validates: Requirements 1.1, 1.5**
    fc.assert(
      fc.property(unfinishedWorkoutArbitrary, restoreClockArbitrary, ({ routine, workout }, at) => {
        const checkpoint = checkpointOf(workout);
        expect(checkpoint).not.toBeNull();
        expect(checkpoint?.version).toBe(1);
        const parsed: unknown = JSON.parse(JSON.stringify(checkpoint));
        expect(restoreWorkout(parsed, routine, at)).not.toBeNull();
      }),
      { numRuns: 200 },
    );
  });

  it('a restored Workout is the same Workout, paused', () => {
    // Feature: resume-after-refresh, Property 2: Restore returns the same Workout, paused
    // **Validates: Requirements 1.2, 2.1, 2.2, 2.3, 2.4, 2.6, 2.7**
    fc.assert(
      fc.property(unfinishedWorkoutArbitrary, restoreClockArbitrary, ({ routine, workout }, at) => {
        const restored = restoreWorkout(
          JSON.parse(JSON.stringify(checkpointOf(workout))) as unknown,
          routine,
          at,
        );
        expect(restored).not.toBeNull();
        if (restored === null) return;

        expect(restored.phase).toBe('paused');
        expect(restored.clock).toBe(at);
        expect(restored.pause?.cause).toBe('restored');
        expect(restored.pause?.at).toBe(at);
        const heldPhase = workout.pause === null ? workout.phase : workout.pause.from;
        expect(restored.pause?.from).toBe(heldPhase);

        expect(restored.confirmed).toEqual(workout.confirmed);
        expect(restored.skipped).toEqual(workout.skipped);
        expect(restored.slots).toEqual(workout.slots);
        expect(restored.pausedMs).toBe(workout.pausedMs);

        const restoredView = workoutView(restored);
        expect(restoredView.phase).toBe('paused');
        if (restoredView.phase !== 'paused') return;
        expect(roundTimes(restoredView.held)).toEqual(roundTimes(frozenView(workout)));
      }),
      { numRuns: 200 },
    );
  });

  it('a summary has no checkpoint', () => {
    const routine = stretchRoutine(10);
    let w = startWorkout(routine, 0);
    w = confirmSet(advance(w, 10_000), 10_000);
    w = confirmSet(advance(w, 20_000), 20_000);
    expect(workoutView(w).phase).toBe('summary');
    expect(checkpointOf(w)).toBeNull();
  });

  it('a user-paused Workout restores with the cause restored', () => {
    const routine = stretchRoutine(30);
    const paused = pauseWorkout(startWorkout(routine, 1_000), 5_000);
    expect(paused.pause?.cause).toBe('user');
    const restored = restoreWorkout(
      JSON.parse(JSON.stringify(checkpointOf(paused))) as unknown,
      routine,
      200,
    );
    expect(restored?.phase).toBe('paused');
    expect(restored?.pause).toEqual({ cause: 'restored', from: 'exercising', at: 200 });
  });

  it('a seconds Set that had run to its target restores ready to confirm', () => {
    const routine = stretchRoutine(30);
    const running = advance(startWorkout(routine, 0), 45_000);
    const restored = restoreWorkout(checkpointOf(running), routine, 7);
    expect(restored).not.toBeNull();
    if (restored === null) return;
    const view = workoutView(restored);
    expect(view.phase).toBe('paused');
    if (view.phase !== 'paused' || view.held.phase !== 'exercising') {
      throw new Error('expected a held exercising view');
    }
    expect(view.held.timer).toEqual({ kind: 'seconds', targetSeconds: 30, remainingMs: 0 });
  });

  it('a restored Workout shows the cause restored in its view', () => {
    const routine = stretchRoutine(30);
    const restored = restoreWorkout(checkpointOf(startWorkout(routine, 0)), routine, 99);
    expect(restored).not.toBeNull();
    if (restored === null) return;
    const view = workoutView(restored);
    expect(view.phase === 'paused' && view.cause).toBe('restored');
  });
});
