import type { StorageAdapter } from './types';

export type MemoryStorage = StorageAdapter & {
  /** A copy of everything stored, for tests. */
  dump(): Record<string, string>;
};

export function createMemoryStorage(initial: Record<string, string> = {}): MemoryStorage {
  const items = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    dump: () => Object.fromEntries(items),
  };
}
