import type { RoutineEntry } from '@/catalog';
import { candyFor } from './candy';
import { isValidActualReps } from './reps';
import { buildSetSlots } from './slots';
import type {
  ExercisingView,
  PauseCause,
  RestingView,
  SetResult,
  SetSlot,
  Workout,
  WorkoutView,
} from './types';

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
    pause: null,
    pausedMs: 0,
    skipped: [],
    outcome: null,
  };
}

/**
 * Move the Workout to clock value `at`. A value before the latest one is treated as the latest.
 * While paused only the clock moves; no Rest ends.
 */
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

/** The clock value the timers read: the pause instant while paused. */
function timeOf(w: Workout): number {
  return w.phase === 'paused' && w.pause !== null ? w.pause.at : w.clock;
}

function setRemainingMs(w: Workout, seconds: number): number {
  return Math.max(0, seconds * 1000 - (timeOf(w) - w.phaseStartedAt));
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
    return {
      ...a,
      confirmed,
      phase: 'summary',
      finishedAt: a.clock,
      outcome: a.skipped.length > 0 ? 'partial' : 'completed',
    };
  }
  if (slot.restSeconds > 0) {
    return { ...a, confirmed, phase: 'resting', phaseStartedAt: a.clock };
  }
  return { ...a, confirmed, index: a.index + 1, phaseStartedAt: a.clock };
}

/** Skip the current Set at clock value `at`. It earns nothing and starts no Rest. */
export function skipSet(w: Workout, at: number): Workout {
  const a = advance(w, at);
  if (a.phase !== 'exercising') return w;
  const skipped = [...a.skipped, a.index];
  if (a.index === a.slots.length - 1) {
    return { ...a, skipped, phase: 'summary', finishedAt: a.clock, outcome: 'partial' };
  }
  return { ...a, skipped, index: a.index + 1, phaseStartedAt: a.clock };
}

/** End the current Rest at clock value `at` and start the next Set. */
export function skipRest(w: Workout, at: number): Workout {
  const a = advance(w, at);
  if (a.phase !== 'resting') return w;
  return { ...a, phase: 'exercising', index: a.index + 1, phaseStartedAt: a.clock };
}

function pauseWith(w: Workout, at: number, cause: PauseCause): Workout {
  const a = advance(w, at);
  if (a.phase !== 'exercising' && a.phase !== 'resting') return w;
  return { ...a, phase: 'paused', pause: { cause, from: a.phase, at: a.clock } };
}

/** Pause at the user's request. */
export function pauseWorkout(w: Workout, at: number): Workout {
  return pauseWith(w, at, 'user');
}

/** Pause because the page became hidden. Never replaces an existing pause. */
export function autoPause(w: Workout, at: number): Workout {
  return pauseWith(w, at, 'auto');
}

/** Continue a paused Workout; the timers pick up where the pause froze them. */
export function resumeWorkout(w: Workout, at: number): Workout {
  if (w.phase !== 'paused' || w.pause === null) return w;
  const a = advance(w, at);
  const paused = a.clock - w.pause.at;
  return {
    ...a,
    phase: w.pause.from,
    phaseStartedAt: a.phaseStartedAt + paused,
    pausedMs: a.pausedMs + paused,
    pause: null,
  };
}

/** Quit: the Workout ends as abandoned. From a pause it ends at the pause instant. */
export function quitWorkout(w: Workout, at: number): Workout {
  if (w.phase === 'summary') return w;
  const a = advance(w, at);
  const finishedAt = a.phase === 'paused' && a.pause !== null ? a.pause.at : a.clock;
  return { ...a, phase: 'summary', finishedAt, pause: null, outcome: 'abandoned' };
}

function resultsOf(w: Workout): SetResult[] {
  const abandoned = w.phase === 'summary' && w.outcome === 'abandoned';
  return w.slots.map((_, i): SetResult => {
    if (w.confirmed.some((c) => c.slotIndex === i)) return 'confirmed';
    if (w.skipped.includes(i)) return 'skipped';
    return abandoned ? 'notReached' : 'pending';
  });
}

function activeView(
  w: Workout,
  candyEarned: number,
  results: readonly SetResult[],
  phase: 'exercising' | 'resting',
): ExercisingView | RestingView {
  const totalSets = w.slots.length;
  if (phase === 'resting') {
    const rest = slotAt(w, w.index).restSeconds;
    return {
      phase: 'resting',
      totalSets,
      candyEarned,
      results,
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
    results,
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

/** Read-only description of the Workout for display. */
export function workoutView(w: Workout): WorkoutView {
  const totalSets = w.slots.length;
  const setsConfirmed = w.confirmed.length;
  const candyEarned = candyFor(setsConfirmed, totalSets);
  const results = resultsOf(w);

  if (w.phase === 'summary') {
    return {
      phase: 'summary',
      totalSets,
      candyEarned,
      results: results.filter((r): r is Exclude<SetResult, 'pending'> => r !== 'pending'),
      outcome: w.outcome ?? 'completed',
      setsConfirmed,
      setsSkipped: w.skipped.length,
      setsNotReached: totalSets - setsConfirmed - w.skipped.length,
      activeMs: (w.finishedAt ?? w.clock) - w.startedAt - w.pausedMs,
      bonusIncluded: setsConfirmed === totalSets,
    };
  }

  if (w.phase === 'paused' && w.pause !== null) {
    return {
      phase: 'paused',
      totalSets,
      candyEarned,
      results,
      cause: w.pause.cause,
      held: activeView(w, candyEarned, results, w.pause.from),
    };
  }

  return activeView(w, candyEarned, results, w.phase === 'resting' ? 'resting' : 'exercising');
}
