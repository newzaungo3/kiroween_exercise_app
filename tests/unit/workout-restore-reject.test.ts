/**
 * Rejected and arbitrary checkpoints: restoreWorkout turns damaged input into
 * null, never throws, and every Workout it accepts is safe to use.
 * Every clock value is an argument; no fake timers.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { routines } from '@/catalog';
import {
  advance,
  autoPause,
  checkpointOf,
  confirmSet,
  pauseWorkout,
  quitWorkout,
  restoreWorkout,
  resumeWorkout,
  skipRest,
  skipSet,
  startWorkout,
  workoutView,
} from '@/workout-engine';
import type { Workout } from '@/workout-engine';
import {
  applyCorruption,
  corruptionArbitrary,
  unfinishedWorkoutArbitrary,
} from './support/workout';

const firstRoutine = routines[0];
if (firstRoutine === undefined) throw new Error('the Catalog holds no Routine');
const routine = firstRoutine;

/** A valid checkpoint of a fresh Workout, as plain JSON data. */
function validCheckpoint(): { version: 1; workout: Record<string, unknown> } {
  const checkpoint = checkpointOf(startWorkout(routine, 1000));
  if (checkpoint === null) throw new Error('a fresh Workout has a checkpoint');
  return JSON.parse(JSON.stringify(checkpoint)) as { version: 1; workout: Record<string, unknown> };
}

/** Use an accepted Workout: view it and run every command at later clock values. */
function exercise(restored: Workout, at: number): void {
  const commands: ((w: Workout, t: number) => Workout)[] = [
    (w, t) => advance(w, t),
    (w, t) => confirmSet(w, t),
    (w, t) => confirmSet(w, t, 7),
    (w, t) => skipSet(w, t),
    (w, t) => skipRest(w, t),
    (w, t) => pauseWorkout(w, t),
    (w, t) => autoPause(w, t),
    (w, t) => resumeWorkout(w, t),
    (w, t) => quitWorkout(w, t),
  ];
  for (const first of [0, 1, 5_000, 700_000]) {
    let w = restored;
    let clock = at;
    for (const command of commands) {
      clock += first;
      w = command(w, clock);
      workoutView(w);
      checkpointOf(w);
    }
  }
  // Resume first so the commands act on a running Workout.
  let w = resumeWorkout(restored, at + 10);
  workoutView(w);
  for (const command of commands) {
    w = command(w, at + 20_000);
    workoutView(w);
    checkpointOf(w);
  }
}

describe('restoreWorkout rejects damaged checkpoints', () => {
  // Feature: resume-after-refresh, Property 4: Corrupted checkpoints are rejected
  // Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
  it('a checkpoint damaged in any one way restores to null', () => {
    fc.assert(
      fc.property(
        unfinishedWorkoutArbitrary,
        corruptionArbitrary,
        fc.integer({ min: -1_000, max: 2_000_000 }),
        ({ routine: r, workout }, corruption, at) => {
          const checkpoint = checkpointOf(workout);
          expect(checkpoint).not.toBeNull();
          if (checkpoint === null) return;
          expect(restoreWorkout(applyCorruption(checkpoint, corruption), r, at)).toBeNull();
        },
      ),
      { numRuns: 200 },
    );
  });

  it('a checkpoint that is not an object restores to null', () => {
    for (const value of [null, undefined, 5, 'text', true, [], [validCheckpoint()]]) {
      expect(restoreWorkout(value, routine, 0)).toBeNull();
    }
  });

  it('a checkpoint with version 2 restores to null', () => {
    expect(restoreWorkout({ ...validCheckpoint(), version: 2 }, routine, 0)).toBeNull();
  });

  it('a checkpoint with no workout restores to null', () => {
    expect(restoreWorkout({ version: 1 }, routine, 0)).toBeNull();
    expect(restoreWorkout({ version: 1, workout: null }, routine, 0)).toBeNull();
  });

  it('a checkpoint of another Routine restores to null', () => {
    const checkpoint = validCheckpoint();
    checkpoint.workout.routineId = `${routine.id}-other`;
    expect(restoreWorkout(checkpoint, routine, 0)).toBeNull();
  });

  it('a checkpoint whose Set_Slot changed restores to null', () => {
    const checkpoint = validCheckpoint();
    const slots = checkpoint.workout.slots as { setCount: number }[];
    const first = slots[0];
    if (first === undefined) throw new Error('no slot');
    first.setCount += 1;
    expect(restoreWorkout(checkpoint, routine, 0)).toBeNull();
  });

  it('a checkpoint in the summary phase restores to null', () => {
    const checkpoint = validCheckpoint();
    checkpoint.workout.phase = 'summary';
    expect(restoreWorkout(checkpoint, routine, 0)).toBeNull();
  });

  it('a checkpoint with a non-finite time restores to null', () => {
    for (const field of ['startedAt', 'clock', 'phaseStartedAt', 'pausedMs']) {
      for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, null, 'x']) {
        const checkpoint = validCheckpoint();
        checkpoint.workout[field] = bad;
        expect(restoreWorkout(checkpoint, routine, 0)).toBeNull();
      }
    }
  });

  it('a restore at a non-finite clock value returns null', () => {
    for (const at of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(restoreWorkout(validCheckpoint(), routine, at)).toBeNull();
    }
  });
});

/** A path into a checkpoint, replaced by random JSON. */
const replacementArbitrary = fc.record({
  target: fc.constantFrom(
    'version',
    'workout',
    'routineId',
    'slots',
    'startedAt',
    'clock',
    'phase',
    'index',
    'phaseStartedAt',
    'confirmed',
    'finishedAt',
    'pause',
    'pausedMs',
    'skipped',
    'outcome',
  ),
  value: fc.jsonValue(),
  /** When set, replace a field one level deeper instead (a pause member or a list item). */
  deep: fc.boolean(),
  pick: fc.integer({ min: 0, max: 1_000 }),
});

describe('restoreWorkout is total and its results are safe', () => {
  // Feature: resume-after-refresh, Property 5: Restore is total and its results are safe
  // Validates: Requirements 4.6
  it('never throws, and every accepted result survives every command', () => {
    fc.assert(
      fc.property(
        unfinishedWorkoutArbitrary,
        fc.array(replacementArbitrary, { maxLength: 3 }),
        fc.jsonValue(),
        fc.integer({ min: -1_000, max: 2_000_000 }),
        ({ routine: r, workout }, replacements, anyJson, at) => {
          // Any JSON value at all.
          expect(() => restoreWorkout(anyJson, r, at)).not.toThrow();
          const fromJson = restoreWorkout(anyJson, r, at);
          if (fromJson !== null) exercise(fromJson, at);

          // A valid checkpoint with random fields replaced by random JSON.
          const checkpoint = JSON.parse(JSON.stringify(checkpointOf(workout))) as Record<
            string,
            unknown
          >;
          for (const { target, value, deep, pick } of replacements) {
            const inner = checkpoint.workout;
            // An earlier replacement may have turned the workout into a non-object.
            if (
              target !== 'version' &&
              target !== 'workout' &&
              (typeof inner !== 'object' || inner === null)
            ) {
              continue;
            }
            const holder: Record<string, unknown> =
              target === 'version' || target === 'workout'
                ? checkpoint
                : (inner as Record<string, unknown>);
            const current = holder[target];
            if (deep && Array.isArray(current) && current.length > 0) {
              current[pick % current.length] = value;
            } else if (deep && typeof current === 'object' && current !== null) {
              const keys = Object.keys(current);
              const key = keys[pick % Math.max(keys.length, 1)];
              if (key !== undefined) (current as Record<string, unknown>)[key] = value;
            } else {
              holder[target] = value;
            }
          }
          let restored: Workout | null = null;
          expect(() => {
            restored = restoreWorkout(checkpoint, r, at);
          }).not.toThrow();
          if (restored !== null) {
            const accepted: Workout = restored;
            expect(accepted.phase).toBe('paused');
            exercise(accepted, at);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
