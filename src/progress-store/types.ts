import type { WorkoutCheckpoint, WorkoutOutcome } from '@/workout-engine';

export const schemaVersion = 3;
export const welcomeGiftCandy = 15;
/** The highest Price an Unlock request may carry. */
export const maxUnlockPrice = 999;
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

export type UnlockKind = 'color' | 'accessory';

/** One permanent Unlock. */
export interface UnlockRecord {
  /** Option_Id. */
  readonly id: string;
  readonly kind: UnlockKind;
  /** The Price at Unlock time, 1..999. */
  readonly candySpent: number;
}

export interface CoachCustomisation {
  /** Normalised Coach name; null means the default name. */
  readonly name: string | null;
  /** Option_Id of the equipped Coach color; null means the default Coach color. */
  readonly color: string | null;
  /** Equipped Accessories, each Unlocked, no repeats, in equip order. */
  readonly accessories: readonly string[];
}

/** The JSON value under `storageKey`. Plain, JSON-safe data. */
export interface ProgressData {
  readonly schemaVersion: 3;
  readonly candy: number;
  readonly welcomeGiftGranted: boolean;
  /** Oldest first. */
  readonly history: readonly WorkoutRecord[];
  /** The unfinished Workout, or null. Shape beyond the envelope is the engine's to judge. */
  readonly checkpoint: WorkoutCheckpoint | null;
  /** Oldest first; only ever grows. */
  readonly unlocks: readonly UnlockRecord[];
  readonly coach: CoachCustomisation;
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
  /** A copy of the Stored_Checkpoint. */
  readonly checkpoint: WorkoutCheckpoint | null;
  /** Candy spent on Unlocks; the sum of every `candySpent`. */
  readonly totalCandySpent: number;
  /** A copy. */
  readonly unlocks: readonly UnlockRecord[];
  /** A copy. */
  readonly coach: CoachCustomisation;
}

export interface UnlockRequest {
  readonly id: string;
  readonly kind: UnlockKind;
  readonly price: number;
}

export type UnlockResult =
  | { readonly unlocked: true; readonly candyBalance: number }
  | { readonly unlocked: false; readonly reason: 'insufficient'; readonly shortBy: number }
  | { readonly unlocked: false; readonly reason: 'already' | 'invalid' };

export type EquipResult =
  | { readonly changed: true }
  | { readonly changed: false; readonly reason: 'unchanged' | 'invalid' | 'locked' };

export type CoachNameResult =
  | { readonly saved: true; readonly name: string | null }
  | { readonly saved: false; readonly reason: 'invalid' };

export type RecordResult =
  | { readonly recorded: true; readonly candyBalance: number }
  | { readonly recorded: false; readonly reason: 'invalid' | 'duplicate' };

export type SaveCheckpointResult =
  | { readonly saved: true }
  | { readonly saved: false; readonly reason: 'invalid' };

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ProgressStore {
  snapshot(): ProgressSnapshot;
  /** True if this call granted the gift. */
  grantWelcomeGift(): boolean;
  recordWorkout(record: WorkoutRecord): RecordResult;
  saveCheckpoint(checkpoint: WorkoutCheckpoint): SaveCheckpointResult;
  /** True if a checkpoint was cleared by this call. */
  clearCheckpoint(): boolean;
  /** Records the Workout and clears the checkpoint in one write. */
  finishWorkout(record: WorkoutRecord): RecordResult;
  /** Spends Candy on an Unlock and equips it; fails with no change on too little Candy. */
  unlock(request: UnlockRequest): UnlockResult;
  /** Null equips the default Coach color. */
  equipColor(id: string | null): EquipResult;
  setAccessoryEquipped(id: string, equipped: boolean): EquipResult;
  setCoachName(text: string): CoachNameResult;
  /** Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}
