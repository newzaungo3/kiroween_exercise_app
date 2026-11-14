import type { WorkoutOutcome } from '@/workout-engine';

export const schemaVersion = 1;
export const welcomeGiftCandy = 15;
export const storageKey = 'spooky-coach:progress';

/** One finished Workout, as the Recording_Bridge hands it over and as it is stored. */
export interface WorkoutRecord {
  /** `${routineId}:${finishedAt}`; unique per Workout. */
  readonly id: string;
  readonly routineId: string;
  /** Milliseconds since the Unix epoch. Display only; never used for order. */
  readonly finishedAt: number;
  readonly outcome: WorkoutOutcome;
  readonly candyEarned: number;
}

/** The JSON value under `storageKey`. Plain, JSON-safe data. */
export interface ProgressData {
  readonly schemaVersion: 1;
  readonly candy: number;
  readonly welcomeGiftGranted: boolean;
  /** Oldest first. */
  readonly history: readonly WorkoutRecord[];
}

export interface ProgressSnapshot {
  readonly schemaVersion: number;
  readonly candyBalance: number;
  readonly welcomeGiftGranted: boolean;
  /** Newest first. */
  readonly history: readonly WorkoutRecord[];
  readonly totalCandyEarned: number;
  /** False when the store works in memory only. */
  readonly persistent: boolean;
}

export type RecordResult =
  | { readonly recorded: true; readonly candyBalance: number }
  | { readonly recorded: false; readonly reason: 'invalid' | 'duplicate' };

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ProgressStore {
  snapshot(): ProgressSnapshot;
  /** True if this call granted the gift. */
  grantWelcomeGift(): boolean;
  recordWorkout(record: WorkoutRecord): RecordResult;
  /** Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}
