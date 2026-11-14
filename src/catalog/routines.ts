/**
 * Routine content. Read-only at runtime.
 *
 * Every text is a Strings_Module identifier; the Catalog never resolves text.
 * Each Routine ends with a Cool-down of Stretches, kept in its own list.
 */
import type { RoutineEntry } from './types';

export const routineContent = [
  {
    id: 'graveyard-shift',
    slug: 'graveyard-shift',
    nameId: 'routine.graveyardShift.name',
    // Tunable content.
    steps: [
      { entryId: 'skeleton-jacks', sets: 2, target: { reps: 20 }, restSeconds: 30 },
      { entryId: 'grave-rise', sets: 3, target: { reps: 10 }, restSeconds: 30 },
      { entryId: 'coffin-push', sets: 2, target: { reps: 8 }, restSeconds: 45 },
    ],
    coolDown: [
      { entryId: 'gravestone-lean', sets: 1, target: { seconds: 30 }, restSeconds: 10 },
      { entryId: 'bat-hang', sets: 1, target: { seconds: 30 }, restSeconds: 10 },
    ],
  },
] as const satisfies readonly RoutineEntry[];
