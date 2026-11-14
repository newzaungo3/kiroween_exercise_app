import { parseProgress, serialiseProgress } from './codec';
import { emptyProgress, grantWelcomeGift, recordWorkout, snapshotOf } from './rules';
import {
  storageKey,
  type ProgressData,
  type ProgressSnapshot,
  type ProgressStore,
  type RecordResult,
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
      snapshot.persistent === persistent
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

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
