import type { Workout } from '@/workout-engine';

/** How often an active Workout is saved while no Checkpoint_Moment happens. */
export const checkpointIntervalMs = 5000;

/** Changes exactly when a Checkpoint_Moment happens; unchanged by a tick that moves only the clock. */
export function checkpointKey(w: Workout): string {
  const pause = w.pause === null ? '-' : `${w.pause.cause}:${w.pause.from}`;
  return `${w.phase}|${w.index}|${w.confirmed.length}|${w.skipped.length}|${pause}`;
}
