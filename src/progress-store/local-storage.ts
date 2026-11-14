import type { StorageAdapter } from './types';

/**
 * The browser adapter. The only file of this folder that names the browser
 * storage. The property access sits inside the methods, because reading it can
 * throw in some privacy modes and the store catches that.
 */
export function createLocalStorageAdapter(): StorageAdapter {
  return {
    getItem: (key) => globalThis.localStorage.getItem(key),
    setItem: (key, value) => {
      globalThis.localStorage.setItem(key, value);
    },
  };
}
