import type { WorkoutOutcome } from '@/workout-engine';
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
};

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
  };
}
