import { parseProgress, serialiseProgress } from './codec';
import {
  emptyProgress,
  finishWorkout,
  grantWelcomeGift,
  recordWorkout,
  snapshotOf,
  withCheckpoint,
  withoutCheckpoint,
} from './rules';
import type { WorkoutCheckpoint } from '@/workout-engine';
import {
  storageKey,
  type ProgressData,
  type ProgressSnapshot,
  type ProgressStore,
  type RecordResult,
  type SaveCheckpointResult,
  type StorageAdapter,
  type WorkoutRecord,
} from './types';

/**
 * Sequences "read, apply a rule, write, notify". Reads and writes storage only
 * through the injected adapter. Every change re-reads the stored text first, so
 * two stores over one storage lose no update.
 */
export function createProgressStore(storage: StorageAdapter): ProgressStore {
  let memory: ProgressData = emptyProgress;
  let storageWorks = true;
  let newer = false;
  const listeners = new Set<() => void>();

  function load(): ProgressData {
    // Once storage failed, memory is the only truth for the rest of the page.
    if (!storageWorks) return memory;
    let text: string | null;
    try {
      text = storage.getItem(storageKey);
    } catch {
      storageWorks = false;
      return memory;
    }
    const parsed = parseProgress(text);
    if (parsed.kind === 'data') {
      newer = false;
      memory = parsed.data;
    } else if (parsed.kind === 'none') {
      newer = false;
      memory = emptyProgress;
    } else {
      newer = true;
    }
    return memory;
  }

  const isPersistent = (): boolean => storageWorks && !newer;

  function sameView(snapshot: ProgressSnapshot, data: ProgressData, persistent: boolean): boolean {
    return (
      snapshot.candyBalance === data.candy &&
      snapshot.welcomeGiftGranted === data.welcomeGiftGranted &&
      snapshot.history.length === data.history.length &&
      snapshot.persistent === persistent &&
      JSON.stringify(snapshot.checkpoint) === JSON.stringify(data.checkpoint)
    );
  }

  load();
  let cached: ProgressSnapshot = snapshotOf(memory, isPersistent());

  /** Rebuilds the snapshot when the view changed; returns whether it did. */
  function refresh(): boolean {
    if (sameView(cached, memory, isPersistent())) return false;
    cached = snapshotOf(memory, isPersistent());
    return true;
  }

  function notify(): void {
    for (const listener of [...listeners]) listener();
  }

  /** Stores the new data and tells the listeners once. */
  function commit(next: ProgressData): void {
    memory = next;
    if (!newer) {
      try {
        storage.setItem(storageKey, serialiseProgress(next));
      } catch {
        storageWorks = false;
      }
    }
    cached = snapshotOf(memory, isPersistent());
    notify();
  }

  return {
    snapshot: () => cached,

    grantWelcomeGift(): boolean {
      const next = grantWelcomeGift(load());
      if (next === null) {
        if (refresh()) notify();
        return false;
      }
      commit(next);
      return true;
    },

    recordWorkout(record: WorkoutRecord): RecordResult {
      const next = recordWorkout(load(), record);
      if (next === 'invalid' || next === 'duplicate') {
        if (refresh()) notify();
        return { recorded: false, reason: next };
      }
      commit(next);
      return { recorded: true, candyBalance: next.candy };
    },

    saveCheckpoint(checkpoint: WorkoutCheckpoint): SaveCheckpointResult {
      const next = withCheckpoint(load(), checkpoint);
      if (next === 'invalid') {
        if (refresh()) notify();
        return { saved: false, reason: 'invalid' };
      }
      commit(next);
      return { saved: true };
    },

    clearCheckpoint(): boolean {
      const next = withoutCheckpoint(load());
      if (next === null) {
        if (refresh()) notify();
        return false;
      }
      commit(next);
      return true;
    },

    finishWorkout(record: WorkoutRecord): RecordResult {
      const outcome = finishWorkout(load(), record);
      if (outcome.kind === 'invalid') {
        if (refresh()) notify();
        return { recorded: false, reason: 'invalid' };
      }
      if (outcome.kind === 'duplicate') {
        if (outcome.data === null) {
          if (refresh()) notify();
        } else {
          commit(outcome.data);
        }
        return { recorded: false, reason: 'duplicate' };
      }
      commit(outcome.data);
      return { recorded: true, candyBalance: outcome.data.candy };
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
