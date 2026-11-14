import type { RoutineEntry } from '@/catalog';
import { candyFor } from './candy';
import { isValidActualReps } from './reps';
import { buildSetSlots } from './slots';
import type { SetSlot, Workout, WorkoutView } from './types';

/** The slot at `index`; a Workout's indices are always in range, so a miss is a bug. */
function slotAt(w: Workout, index: number): SetSlot {
  const slot = w.slots[index];
  if (slot === undefined) throw new Error(`Workout has no Set at index ${index}`);
  return slot;
}

/** Begin a Workout on the first Set of a Routine at clock value `at` (ms). */
export function startWorkout(routine: RoutineEntry, at: number): Workout {
  return {
    routineId: routine.id,
    slots: buildSetSlots(routine),
    startedAt: at,
    clock: at,
    phase: 'exercising',
    index: 0,
    phaseStartedAt: at,
    confirmed: [],
    finishedAt: null,
  };
}

/** Move the Workout to clock value `at`. A value before the latest one is treated as the latest. */
export function advance(w: Workout, at: number): Workout {
  if (w.phase === 'summary') return w;
  const clock = Math.max(at, w.clock);
  if (w.phase === 'resting') {
    const restEnd = w.phaseStartedAt + slotAt(w, w.index).restSeconds * 1000;
    if (clock >= restEnd) {
      return { ...w, clock, phase: 'exercising', index: w.index + 1, phaseStartedAt: restEnd };
    }
  }
  return { ...w, clock };
}

function setRemainingMs(w: Workout, seconds: number): number {
  return Math.max(0, seconds * 1000 - (w.clock - w.phaseStartedAt));
}

/**
 * Confirm the current Set at clock value `at`. Returns the same Workout object
 * when the confirm is rejected.
 */
export function confirmSet(w: Workout, at: number, actualReps?: number): Workout {
  const a = advance(w, at);
  if (a.phase !== 'exercising') return w;
  const slot = slotAt(a, a.index);

  let reps: number | null;
  if (slot.target.reps !== undefined) {
    const value = actualReps ?? slot.target.reps;
    if (!isValidActualReps(value)) return w;
    reps = value;
  } else {
    if (setRemainingMs(a, slot.target.seconds) > 0) return w;
    reps = null;
  }

  const confirmed = [...a.confirmed, { slotIndex: a.index, actualReps: reps }];
  if (a.index === a.slots.length - 1) {
    return { ...a, confirmed, phase: 'summary', finishedAt: a.clock };
  }
  if (slot.restSeconds > 0) {
    return { ...a, confirmed, phase: 'resting', phaseStartedAt: a.clock };
  }
  return { ...a, confirmed, index: a.index + 1, phaseStartedAt: a.clock };
}

/** Read-only description of the Workout for display. */
export function workoutView(w: Workout): WorkoutView {
  const totalSets = w.slots.length;
  const setsConfirmed = w.confirmed.length;
  const candyEarned = candyFor(setsConfirmed, totalSets);

  if (w.phase === 'summary') {
    return {
      phase: 'summary',
      totalSets,
      candyEarned,
      outcome: 'completed',
      setsConfirmed,
      setsSkipped: totalSets - setsConfirmed,
      activeMs: (w.finishedAt ?? w.clock) - w.startedAt,
      bonusIncluded: setsConfirmed === totalSets,
    };
  }

  if (w.phase === 'resting') {
    const rest = slotAt(w, w.index).restSeconds;
    return {
      phase: 'resting',
      totalSets,
      candyEarned,
      restRemainingMs: setRemainingMs(w, rest),
      next: slotAt(w, w.index + 1),
      nextPosition: w.index + 2,
    };
  }

  const slot = slotAt(w, w.index);
  return {
    phase: 'exercising',
    totalSets,
    candyEarned,
    slot,
    position: w.index + 1,
    timer:
      slot.target.reps !== undefined
        ? { kind: 'reps', targetReps: slot.target.reps, defaultReps: slot.target.reps }
        : {
            kind: 'seconds',
            targetSeconds: slot.target.seconds,
            remainingMs: setRemainingMs(w, slot.target.seconds),
          },
  };
}
