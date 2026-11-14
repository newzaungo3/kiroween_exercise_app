import type { WorkoutCheckpoint, WorkoutOutcome } from '@/workout-engine';
import {
  schemaVersion,
  welcomeGiftCandy,
  type ProgressData,
  type ProgressSnapshot,
  type WorkoutRecord,
} from './types';

/** Pure rules over ProgressData. Every function returns new objects and mutates nothing. */

const outcomes = ['completed', 'partial', 'abandoned'] as const satisfies readonly WorkoutOutcome[];

// Compile-time check: a new Workout outcome in the engine fails the Type_Check here.
type OutcomesCoverEngine = WorkoutOutcome extends (typeof outcomes)[number] ? true : never;
const outcomesCoverEngine: OutcomesCoverEngine = true;
void outcomesCoverEngine;

const maxFinishedAt = 8_640_000_000_000_000;

export const emptyProgress: ProgressData = {
  schemaVersion,
  candy: 0,
  welcomeGiftGranted: false,
  history: [],
  checkpoint: null,
};

/** The envelope the store can judge: version 1 and a workout object with a routine id. */
export function isCheckpointEnvelope(value: unknown): value is WorkoutCheckpoint {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const envelope = value as Record<string, unknown>;
  if (envelope.version !== 1) return false;
  const workout = envelope.workout;
  if (typeof workout !== 'object' || workout === null || Array.isArray(workout)) return false;
  return isNonEmptyText((workout as Record<string, unknown>).routineId);
}

export function withCheckpoint(
  data: ProgressData,
  checkpoint: WorkoutCheckpoint,
): ProgressData | 'invalid' {
  if (!isCheckpointEnvelope(checkpoint)) return 'invalid';
  return { ...data, history: [...data.history], checkpoint };
}

/** Null when there is no checkpoint to clear. */
export function withoutCheckpoint(data: ProgressData): ProgressData | null {
  if (data.checkpoint === null) return null;
  return { ...data, history: [...data.history], checkpoint: null };
}

export type FinishOutcome =
  | { readonly kind: 'recorded'; readonly data: ProgressData }
  | { readonly kind: 'duplicate'; readonly data: ProgressData | null } // null: nothing to change
  | { readonly kind: 'invalid' };

/** Records the Workout and clears the checkpoint in one step. */
export function finishWorkout(data: ProgressData, record: WorkoutRecord): FinishOutcome {
  if (!validateRecord(record)) return { kind: 'invalid' };
  if (data.history.some((entry) => entry.id === record.id)) {
    return { kind: 'duplicate', data: withoutCheckpoint(data) };
  }
  return {
    kind: 'recorded',
    data: {
      ...data,
      candy: data.candy + record.candyEarned,
      history: [...data.history, { ...record }],
      checkpoint: null,
    },
  };
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function validateRecord(value: unknown): value is WorkoutRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const { finishedAt, candyEarned, outcome } = record;
  return (
    isNonEmptyText(record.id) &&
    isNonEmptyText(record.routineId) &&
    typeof finishedAt === 'number' &&
    Number.isInteger(finishedAt) &&
    finishedAt >= 0 &&
    finishedAt <= maxFinishedAt &&
    typeof candyEarned === 'number' &&
    Number.isSafeInteger(candyEarned) &&
    candyEarned >= 0 &&
    typeof outcome === 'string' &&
    (outcomes as readonly string[]).includes(outcome)
  );
}

/** Returns the new data, or null when the Welcome gift was already granted. */
export function grantWelcomeGift(data: ProgressData): ProgressData | null {
  if (data.welcomeGiftGranted) return null;
  return {
    ...data,
    candy: data.candy + welcomeGiftCandy,
    welcomeGiftGranted: true,
    history: [...data.history],
  };
}

export function recordWorkout(
  data: ProgressData,
  record: WorkoutRecord,
): ProgressData | 'invalid' | 'duplicate' {
  if (!validateRecord(record)) return 'invalid';
  if (data.history.some((entry) => entry.id === record.id)) return 'duplicate';
  return {
    ...data,
    candy: data.candy + record.candyEarned,
    history: [...data.history, { ...record }],
  };
}

export function totalCandyEarned(data: ProgressData): number {
  return data.history.reduce((sum, entry) => sum + entry.candyEarned, 0);
}

export function snapshotOf(data: ProgressData, persistent: boolean): ProgressSnapshot {
  return {
    schemaVersion: data.schemaVersion,
    candyBalance: data.candy,
    welcomeGiftGranted: data.welcomeGiftGranted,
    history: data.history.map((entry) => ({ ...entry })).reverse(),
    totalCandyEarned: totalCandyEarned(data),
    persistent,
    // Plain JSON-safe data: a round trip gives the caller a copy.
    checkpoint:
      data.checkpoint === null
        ? null
        : (JSON.parse(JSON.stringify(data.checkpoint)) as WorkoutCheckpoint),
  };
}
