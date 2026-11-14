/**
 * The page's one Progress_Store. It is created lazily and only in the browser,
 * so it never exists during server rendering. `useProgress` and the
 * Read_Only_Bridge share it, so one page has one store.
 */
import {
  createLocalStorageAdapter,
  createProgressStore,
  type ProgressSnapshot,
  type ProgressStore,
} from '@/progress-store';

let store: ProgressStore | null = null;

export function getPageStore(): ProgressStore {
  if (store === null) store = createProgressStore(createLocalStorageAdapter());
  return store;
}

export function subscribePageStore(listener: () => void): () => void {
  return getPageStore().subscribe(listener);
}

export const readPageSnapshot = (): ProgressSnapshot => getPageStore().snapshot();

/** The snapshot while rendering on the server and hydrating: none. */
export const readServerSnapshot = (): null => null;
