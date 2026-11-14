import type { WorkoutRecord } from '@/progress-store';
import type { SummaryView } from '@/workout-engine';

/**
 * Builds the stored record of a finished Workout. Pure: the time is an
 * argument, and the Candy is copied from the summary, never recomputed.
 */
export function workoutRecordOf(
  view: SummaryView,
  routineId: string,
  finishedAt: number,
): WorkoutRecord {
  return {
    id: `${routineId}:${finishedAt}`,
    routineId,
    finishedAt,
    outcome: view.outcome,
    candyEarned: view.candyEarned,
  };
}
