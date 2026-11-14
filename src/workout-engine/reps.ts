export const minActualReps = 0;
export const maxActualReps = 200;

/** True only for a whole number from minActualReps to maxActualReps. */
export function isValidActualReps(value: number): boolean {
  return Number.isInteger(value) && value >= minActualReps && value <= maxActualReps;
}
