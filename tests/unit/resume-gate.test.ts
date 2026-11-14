import { describe, expect, it } from 'vitest';
import { routines } from '@/catalog';
import { createMemoryStorage, createProgressStore } from '@/progress-store';
import type { ProgressSnapshot } from '@/progress-store';
import { decideGate } from '@/ui/progress/gate';
import { checkpointOf, confirmSet, startWorkout } from '@/workout-engine';
import type { WorkoutCheckpoint } from '@/workout-engine';

const routine = routines.find((r) => r.id === 'graveyard-shift');
if (routine === undefined) throw new Error('graveyard-shift is missing from the Catalog');

const base = createProgressStore(createMemoryStorage()).snapshot();

function snapshotWith(checkpoint: WorkoutCheckpoint | null): ProgressSnapshot {
  return { ...base, checkpoint };
}

const restorable = ((): WorkoutCheckpoint => {
  const checkpoint = checkpointOf(confirmSet(startWorkout(routine, 0), 1_000, 20));
  if (checkpoint === null) throw new Error('expected a checkpoint');
  return checkpoint;
})();

const unrestorable = { version: 1, workout: { routineId: 'not-in-catalog' } } as unknown as WorkoutCheckpoint;

describe('decideGate', () => {
  it('shows loading until the Progress_Snapshot is read', () => {
    expect(
      decideGate({ snapshot: null, routineId: 'graveyard-shift', intent: null, locked: null }),
    ).toEqual({ kind: 'loading' });
  });

  it('is fresh when there is no checkpoint', () => {
    expect(
      decideGate({ snapshot: snapshotWith(null), routineId: 'graveyard-shift', intent: null, locked: null }),
    ).toEqual({ kind: 'fresh' });
  });

  it('asks Resume or Discard for a restorable checkpoint with no intent', () => {
    const gate = decideGate({
      snapshot: snapshotWith(restorable),
      routineId: 'graveyard-shift',
      intent: null,
      locked: null,
    });
    expect(gate.kind).toBe('prompt');
  });

  it('resumes when the intent names this Routine', () => {
    const gate = decideGate({
      snapshot: snapshotWith(restorable),
      routineId: 'graveyard-shift',
      intent: 'graveyard-shift',
      locked: null,
    });
    expect(gate).toEqual({ kind: 'resumed', checkpoint: restorable });
  });

  it('asks when the intent names another Routine', () => {
    const gate = decideGate({
      snapshot: snapshotWith(restorable),
      routineId: 'graveyard-shift',
      intent: 'moonlight-stretch',
      locked: null,
    });
    expect(gate.kind).toBe('prompt');
  });

  it('is fresh when the checkpoint cannot be restored', () => {
    expect(
      decideGate({
        snapshot: snapshotWith(unrestorable),
        routineId: 'graveyard-shift',
        intent: 'graveyard-shift',
        locked: null,
      }),
    ).toEqual({ kind: 'fresh' });
  });

  it('a fresh lock wins over any snapshot', () => {
    for (const snapshot of [null, snapshotWith(null), snapshotWith(restorable)]) {
      expect(
        decideGate({ snapshot, routineId: 'graveyard-shift', intent: 'graveyard-shift', locked: 'fresh' }),
      ).toEqual({ kind: 'fresh' });
    }
  });

  it('a resumed lock wins over any snapshot', () => {
    for (const snapshot of [null, snapshotWith(null), snapshotWith(restorable)]) {
      expect(
        decideGate({
          snapshot,
          routineId: 'graveyard-shift',
          intent: null,
          locked: { resumed: restorable },
        }),
      ).toEqual({ kind: 'resumed', checkpoint: restorable });
    }
  });

  it('a prompt for a checkpoint of a different Routine names that Routine', () => {
    const gate = decideGate({
      snapshot: snapshotWith(restorable),
      routineId: 'moonlight-stretch',
      intent: null,
      locked: null,
    });
    expect(gate.kind).toBe('prompt');
    if (gate.kind === 'prompt') expect(gate.info.routine.id).toBe('graveyard-shift');
  });

  it('an intent for this page does not resume a checkpoint of another Routine', () => {
    const gate = decideGate({
      snapshot: snapshotWith(restorable),
      routineId: 'moonlight-stretch',
      intent: 'moonlight-stretch',
      locked: null,
    });
    expect(gate.kind).toBe('prompt');
  });
});
