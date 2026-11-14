import { discardRecordOf } from './checkpoint-info';
import type { ProgressApi } from './useProgress';

/**
 * Discards an unfinished Workout: records it as abandoned with the Candy of its
 * confirmed Sets, or just clears a checkpoint that cannot be used. Returns the
 * Candy of the record (0 when nothing was recorded). Reads the wall clock here
 * and in the bridge's onFinished only.
 */
export function discardWorkout(
  progress: Pick<ProgressApi, 'ensureWelcomeGift' | 'finishWorkout' | 'clearCheckpoint'>,
  checkpoint: unknown,
): number {
  const record = discardRecordOf(checkpoint, Date.now());
  if (record === null) {
    progress.clearCheckpoint();
    return 0;
  }
  progress.ensureWelcomeGift();
  progress.finishWorkout(record);
  return record.candyEarned;
}
