import type { RoutineEntry } from '@/catalog';
import { isValidActualReps } from './reps';
import { buildSetSlots } from './slots';
import type { ConfirmedSet, PauseCause, SetSlot, Workout } from './types';

export const checkpointVersion = 1;

/** Plain, JSON-safe data. Carries no wall-clock time. */
export interface WorkoutCheckpoint {
  readonly version: 1;
  readonly workout: Workout;
}

/** null in the summary: a finished Workout has no checkpoint. */
export function checkpointOf(w: Workout): WorkoutCheckpoint | null {
  if (w.phase === 'summary') return null;
  return { version: checkpointVersion, workout: w };
}

type Held = 'exercising' | 'resting';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIndex(value: unknown, length: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length;
}

function slotMatches(value: unknown, expected: SetSlot): boolean {
  if (!isRecord(value) || !isRecord(value.target)) return false;
  return (
    value.entryId === expected.entryId &&
    value.setNumber === expected.setNumber &&
    value.setCount === expected.setCount &&
    value.restSeconds === expected.restSeconds &&
    value.target.reps === expected.target.reps &&
    value.target.seconds === expected.target.seconds
  );
}

function slotsMatch(value: unknown, expected: readonly SetSlot[]): boolean {
  if (!Array.isArray(value) || value.length !== expected.length) return false;
  return expected.every((slot, i) => slotMatches(value[i] as unknown, slot));
}

function readConfirmed(value: unknown, slots: readonly SetSlot[]): ConfirmedSet[] | null {
  if (!Array.isArray(value)) return null;
  const out: ConfirmedSet[] = [];
  for (const item of value as unknown[]) {
    if (!isRecord(item) || !isIndex(item.slotIndex, slots.length)) return null;
    const reps = item.actualReps;
    const slot = slots[item.slotIndex];
    if (slot === undefined) return null;
    if (slot.target.seconds !== undefined) {
      if (reps !== null) return null;
    } else if (typeof reps !== 'number' || !isValidActualReps(reps)) {
      return null;
    }
    out.push({ slotIndex: item.slotIndex, actualReps: reps });
  }
  return out;
}

function readSkipped(value: unknown, length: number): number[] | null {
  if (!Array.isArray(value)) return null;
  const out: number[] = [];
  for (const item of value as unknown[]) {
    if (!isIndex(item, length)) return null;
    out.push(item);
  }
  return out;
}

function isCause(value: unknown): value is PauseCause {
  return value === 'user' || value === 'auto' || value === 'restored';
}

function isHeld(value: unknown): value is Held {
  return value === 'exercising' || value === 'resting';
}

/**
 * Validate `value` for `routine` and return the Workout rebased onto the clock
 * value `at`, paused with the cause 'restored'; null for any unusable value.
 * Never throws.
 */
export function restoreWorkout(value: unknown, routine: RoutineEntry, at: number): Workout | null {
  try {
    return restore(value, routine, at);
  } catch {
    return null;
  }
}

function restore(value: unknown, routine: RoutineEntry, at: number): Workout | null {
  if (!isFiniteNumber(at)) return null;
  // Step 1: the envelope.
  if (!isRecord(value) || value.version !== checkpointVersion || !isRecord(value.workout)) {
    return null;
  }
  const w = value.workout;

  // Step 2: guarded field reads.
  if (w.routineId !== routine.id) return null;
  const slots = buildSetSlots(routine);
  if (!slotsMatch(w.slots, slots)) return null;
  const { startedAt, clock, phaseStartedAt, pausedMs, index } = w;
  if (
    !isFiniteNumber(startedAt) ||
    !isFiniteNumber(clock) ||
    !isFiniteNumber(phaseStartedAt) ||
    !isFiniteNumber(pausedMs) ||
    typeof index !== 'number' ||
    !Number.isInteger(index)
  ) {
    return null;
  }
  if (w.phase !== 'exercising' && w.phase !== 'resting' && w.phase !== 'paused') return null;
  if (w.finishedAt !== null || w.outcome !== null) return null;
  const confirmed = readConfirmed(w.confirmed, slots);
  const skipped = readSkipped(w.skipped, slots.length);
  if (confirmed === null || skipped === null) return null;

  // Step 3: the held phase and the pause.
  let held: Held;
  let freeze: number;
  if (w.phase === 'paused') {
    const pause = w.pause;
    if (!isRecord(pause) || !isCause(pause.cause) || !isHeld(pause.from)) return null;
    if (!isFiniteNumber(pause.at) || pause.at > clock) return null;
    held = pause.from;
    freeze = pause.at;
  } else {
    if (w.pause !== null) return null;
    held = w.phase;
    freeze = clock;
  }

  // Step 4: the index.
  const n = slots.length;
  if (index < 0 || index > n - 1) return null;
  if (held === 'resting') {
    const restSeconds = slots[index]?.restSeconds ?? 0;
    if (index > n - 2 || restSeconds <= 0) return null;
  }

  // Step 5: resolved Sets are exactly the prefix.
  const confirmedSet = new Set(confirmed.map((c) => c.slotIndex));
  const skippedSet = new Set(skipped);
  if (confirmedSet.size !== confirmed.length || skippedSet.size !== skipped.length) return null;
  for (const s of skippedSet) if (confirmedSet.has(s)) return null;
  const resolved = held === 'resting' ? index + 1 : index;
  if (confirmedSet.size + skippedSet.size !== resolved) return null;
  for (let i = 0; i < resolved; i += 1) {
    if (!confirmedSet.has(i) && !skippedSet.has(i)) return null;
  }
  if (held === 'resting' && !confirmedSet.has(index)) return null;

  // Step 6: times.
  if (!(startedAt <= phaseStartedAt && phaseStartedAt <= freeze)) return null;
  if (!(pausedMs >= 0 && pausedMs <= freeze - startedAt)) return null;

  // Step 7: rebase onto `at`. The closed time drops out.
  const delta = at - freeze;
  return {
    routineId: routine.id,
    slots,
    startedAt: startedAt + delta,
    clock: at,
    phase: 'paused',
    index,
    phaseStartedAt: phaseStartedAt + delta,
    confirmed,
    finishedAt: null,
    pause: { cause: 'restored', from: held, at },
    pausedMs,
    skipped,
    outcome: null,
  };
}
