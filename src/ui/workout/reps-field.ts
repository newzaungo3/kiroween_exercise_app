import { isValidActualReps, maxActualReps, minActualReps } from '@/workout-engine/reps';

/** The reps the user typed, or null when the text is not a whole number from 0 to 200. */
export function parseActualReps(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return isValidActualReps(value) ? value : null;
}

/** One rep fewer or more, kept within 0 to 200. */
export function stepReps(value: number, delta: -1 | 1): number {
  return Math.min(maxActualReps, Math.max(minActualReps, value + delta));
}
