import type { Kind } from './types';

/**
 * Splits a list by Kind. Every entry lands in exactly one list, and each list
 * keeps the order of the input.
 */
export function partitionByKind<E extends { readonly kind: Kind }>(
  list: readonly E[],
): { readonly exercises: readonly E[]; readonly stretches: readonly E[] } {
  const exercises: E[] = [];
  const stretches: E[] = [];
  for (const entry of list) {
    if (entry.kind === 'exercise') exercises.push(entry);
    else if (entry.kind === 'stretch') stretches.push(entry);
  }
  return { exercises, stretches };
}

/**
 * The entries next to `entry` by position. An entry that is not in the list
 * has neither. A missing neighbour is omitted, not set to undefined.
 */
export function neighbours<E>(
  list: readonly E[],
  entry: E,
): { readonly previous?: E; readonly next?: E } {
  const index = list.indexOf(entry);
  if (index === -1) return {};
  return {
    ...(index > 0 ? { previous: list[index - 1] } : {}),
    ...(index < list.length - 1 ? { next: list[index + 1] } : {}),
  };
}
