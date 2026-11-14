export const candyPerSet = 1;
export const completionBonus = 5;

/** Candy for a Workout: 1 per confirmed Set, plus the bonus when every Set is confirmed. */
export function candyFor(confirmedSets: number, totalSets: number): number {
  const bonus = totalSets > 0 && confirmedSets === totalSets ? completionBonus : 0;
  return confirmedSets * candyPerSet + bonus;
}
