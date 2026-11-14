import type { ProgressSnapshot } from '@/progress-store';
import type { WorkoutCheckpoint } from '@/workout-engine';
import { describeCheckpoint } from './checkpoint-info';
import type { CheckpointInfo } from './checkpoint-info';

export type Gate =
  | { readonly kind: 'loading' }
  | { readonly kind: 'prompt'; readonly info: CheckpointInfo }
  | { readonly kind: 'resumed'; readonly checkpoint: WorkoutCheckpoint }
  | { readonly kind: 'fresh' };

export type GateLock = 'fresh' | { readonly resumed: WorkoutCheckpoint };

/** Decides what the Workout_Route shows. A lock wins over later snapshots. */
export function decideGate(input: {
  readonly snapshot: ProgressSnapshot | null;
  readonly routineId: string;
  readonly intent: string | null;
  readonly locked: GateLock | null;
}): Gate {
  const { snapshot, routineId, intent, locked } = input;
  if (locked !== null) {
    return locked === 'fresh'
      ? { kind: 'fresh' }
      : { kind: 'resumed', checkpoint: locked.resumed };
  }
  if (snapshot === null) return { kind: 'loading' };
  const checkpoint = snapshot.checkpoint;
  if (checkpoint === null) return { kind: 'fresh' };
  const info = describeCheckpoint(checkpoint);
  if (info === null) return { kind: 'fresh' };
  if (intent === routineId && info.routine.id === routineId) {
    return { kind: 'resumed', checkpoint };
  }
  return { kind: 'prompt', info };
}
