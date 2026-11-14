import { findEntryById, routines } from '@/catalog';
import type { ExerciseEntry, RoutineEntry } from '@/catalog';
import type { WorkoutRecord } from '@/progress-store';
import { quitWorkout, restoreWorkout, workoutView } from '@/workout-engine';
import type { SummaryView } from '@/workout-engine';
import { workoutRecordOf } from './workout-record';

/** What the Resume_Prompt says about an unfinished Workout. */
export interface CheckpointInfo {
  readonly routine: RoutineEntry;
  /** The Exercise the Workout is on, or the next one when held in a Rest. */
  readonly entry: ExerciseEntry;
  readonly setNumber: number;
  readonly setCount: number;
  readonly resting: boolean;
  readonly candyEarned: number;
}

/** Reads the Routine id of an untrusted checkpoint, or null. */
function routineOf(checkpoint: unknown): RoutineEntry | null {
  if (typeof checkpoint !== 'object' || checkpoint === null) return null;
  const workout = (checkpoint as { workout?: unknown }).workout;
  if (typeof workout !== 'object' || workout === null) return null;
  const id = (workout as { routineId?: unknown }).routineId;
  if (typeof id !== 'string') return null;
  return routines.find((routine) => routine.id === id) ?? null;
}

/** null for a checkpoint the engine or the Catalog cannot use. Reads no clock. */
export function describeCheckpoint(checkpoint: unknown): CheckpointInfo | null {
  const routine = routineOf(checkpoint);
  if (routine === null) return null;
  const restored = restoreWorkout(checkpoint, routine, 0);
  if (restored === null) return null;
  const view = workoutView(restored);
  if (view.phase !== 'paused') return null;
  const held = view.held;
  const resting = held.phase === 'resting';
  const slot = held.phase === 'resting' ? held.next : held.slot;
  const entry = findEntryById(slot.entryId);
  if (entry === undefined) return null;
  return {
    routine,
    entry,
    setNumber: slot.setNumber,
    setCount: slot.setCount,
    resting,
    candyEarned: view.candyEarned,
  };
}

/** The abandoned record of Discard, equal to quitting at the pause. null if unusable. */
export function discardRecordOf(
  checkpoint: unknown,
  finishedAt: number,
): WorkoutRecord | null {
  const routine = routineOf(checkpoint);
  if (routine === null) return null;
  const restored = restoreWorkout(checkpoint, routine, 0);
  if (restored === null) return null;
  const view = workoutView(quitWorkout(restored, 0));
  if (view.phase !== 'summary') return null;
  return workoutRecordOf(view satisfies SummaryView, routine.id, finishedAt);
}
