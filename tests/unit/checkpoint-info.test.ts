import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { routines } from '@/catalog';
import type { RoutineEntry } from '@/catalog';
import { createMemoryStorage, createProgressStore } from '@/progress-store';
import { validateRecord } from '@/progress-store/rules';
import { describeCheckpoint, discardRecordOf } from '@/ui/progress/checkpoint-info';
import {
  advance,
  checkpointOf,
  confirmSet,
  pauseWorkout,
  quitWorkout,
  skipRest,
  startWorkout,
  workoutView,
} from '@/workout-engine';
import type { Workout } from '@/workout-engine';
import { commandScriptArbitrary, playScript } from './support/workout';

const graveyardShift: RoutineEntry = (() => {
  const found = routines.find((routine) => routine.id === 'graveyard-shift');
  if (found === undefined) throw new Error('graveyard-shift is missing from the Catalog');
  return found;
})();

function checkpointFor(workout: Workout): unknown {
  const checkpoint = checkpointOf(workout);
  if (checkpoint === null) throw new Error('expected a Workout that is not in the summary');
  return checkpoint;
}

describe('Resume prompt: Discard records an abandoned Workout', () => {
  // Feature: resume-after-refresh, Property 14: Discard records abandoned with the confirmed Candy
  it('a Discard records abandoned with the confirmed Candy and records once', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        commandScriptArbitrary(80).map((script) => script.filter((step) => step.kind !== 'quit')),
        fc.integer({ min: 0, max: 8_640_000_000_000_000 }),
        (startAt, script, finishedAt) => {
          const run = playScript(graveyardShift, startAt, script);
          fc.pre(run.workout.phase !== 'summary');
          const checkpoint = checkpointFor(run.workout);

          const record = discardRecordOf(checkpoint, finishedAt);
          expect(record).not.toBeNull();
          if (record === null) return;

          const confirmed = run.workout.confirmed.length;
          const quitSummary = workoutView(quitWorkout(run.workout, run.clock));
          expect(validateRecord(record)).toBe(true);
          expect(record.outcome).toBe('abandoned');
          expect(record.id).toBe(`${graveyardShift.id}:${finishedAt}`);
          expect(record.candyEarned).toBe(confirmed);
          expect(record.candyEarned).toBe(quitSummary.candyEarned);

          const store = createProgressStore(createMemoryStorage());
          store.saveCheckpoint(checkpoint as never);
          store.finishWorkout(record);
          store.finishWorkout(record);
          const snapshot = store.snapshot();
          expect(snapshot.history).toHaveLength(1);
          expect(snapshot.candyBalance).toBe(confirmed);
          expect(snapshot.checkpoint).toBeNull();
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('describeCheckpoint', () => {
  it('describes an exercising Workout on its current Set', () => {
    const info = describeCheckpoint(checkpointFor(startWorkout(graveyardShift, 0)));
    expect(info).not.toBeNull();
    expect(info?.routine.id).toBe('graveyard-shift');
    expect(info?.entry.id).toBe('skeleton-jacks');
    expect(info?.setNumber).toBe(1);
    expect(info?.setCount).toBe(2);
    expect(info?.resting).toBe(false);
    expect(info?.candyEarned).toBe(0);
  });

  it('describes a resting Workout by the Set that comes next', () => {
    const resting = confirmSet(startWorkout(graveyardShift, 0), 1_000, 20);
    expect(workoutView(resting).phase).toBe('resting');
    const info = describeCheckpoint(checkpointFor(resting));
    expect(info?.resting).toBe(true);
    expect(info?.entry.id).toBe('skeleton-jacks');
    expect(info?.setNumber).toBe(2);
    expect(info?.candyEarned).toBe(1);
  });

  it('describes a paused Workout by the phase it was paused in', () => {
    let workout = confirmSet(startWorkout(graveyardShift, 0), 1_000, 20);
    workout = advance(workout, 40_000);
    workout = pauseWorkout(workout, 41_000);
    expect(workout.phase).toBe('paused');
    const info = describeCheckpoint(checkpointFor(workout));
    expect(info?.resting).toBe(false);
    expect(info?.setNumber).toBe(2);
    expect(info?.setCount).toBe(2);
    expect(info?.candyEarned).toBe(1);
  });

  it('returns null for a Routine the Catalog does not hold', () => {
    const generated: RoutineEntry = { ...graveyardShift, id: 'not-in-catalog', slug: 'not-in-catalog' };
    const checkpoint = checkpointFor(startWorkout(generated, 0));
    expect(describeCheckpoint(checkpoint)).toBeNull();
    expect(discardRecordOf(checkpoint, 5)).toBeNull();
  });

  it('returns null for junk', () => {
    expect(describeCheckpoint(null)).toBeNull();
    expect(describeCheckpoint({ version: 1, workout: 7 })).toBeNull();
    expect(discardRecordOf('x', 5)).toBeNull();
  });
});

describe('discardRecordOf', () => {
  it('a Discard after 3 confirmed Sets gives 3 Candy', () => {
    let workout = startWorkout(graveyardShift, 0);
    workout = skipRest(confirmSet(workout, 1_000, 20), 1_500);
    workout = skipRest(confirmSet(workout, 2_000, 20), 2_500);
    workout = confirmSet(workout, 3_000, 10);
    expect(workout.confirmed).toHaveLength(3);

    const record = discardRecordOf(checkpointFor(workout), 123_456);
    expect(record).toEqual({
      id: 'graveyard-shift:123456',
      routineId: 'graveyard-shift',
      finishedAt: 123_456,
      outcome: 'abandoned',
      candyEarned: 3,
    });
  });
});
