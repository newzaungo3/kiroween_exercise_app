import type { WorkoutCheckpoint, WorkoutOutcome } from '@/workout-engine';
import { normaliseCoachName } from './coach-name';
import {
  maxUnlockPrice,
  schemaVersion,
  welcomeGiftCandy,
  type CoachCustomisation,
  type ProgressData,
  type ProgressSnapshot,
  type UnlockRecord,
  type UnlockRequest,
  type WorkoutRecord,
} from './types';

/** Pure rules over ProgressData. Every function returns new objects and mutates nothing. */

const outcomes = ['completed', 'partial', 'abandoned'] as const satisfies readonly WorkoutOutcome[];

// Compile-time check: a new Workout outcome in the engine fails the Type_Check here.
type OutcomesCoverEngine = WorkoutOutcome extends (typeof outcomes)[number] ? true : never;
const outcomesCoverEngine: OutcomesCoverEngine = true;
void outcomesCoverEngine;

const maxFinishedAt = 8_640_000_000_000_000;

export const defaultCoach: CoachCustomisation = { name: null, color: null, accessories: [] };

export const emptyProgress: ProgressData = {
  schemaVersion,
  candy: 0,
  welcomeGiftGranted: false,
  history: [],
  checkpoint: null,
  unlocks: [],
  coach: defaultCoach,
};

const optionIdPattern = /^[a-z][a-z0-9-]{0,39}$/;

export function isOptionId(value: unknown): value is string {
  return typeof value === 'string' && optionIdPattern.test(value);
}

function isUnlockKind(value: unknown): value is UnlockRecord['kind'] {
  return value === 'color' || value === 'accessory';
}

function isPrice(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= maxUnlockPrice
  );
}

export function isUnlockRecord(value: unknown): value is UnlockRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return isOptionId(record.id) && isUnlockKind(record.kind) && isPrice(record.candySpent);
}

export function totalCandySpent(data: ProgressData): number {
  return data.unlocks.reduce((sum, entry) => sum + entry.candySpent, 0);
}

function copyCoach(coach: CoachCustomisation): CoachCustomisation {
  return { name: coach.name, color: coach.color, accessories: [...coach.accessories] };
}

function copyUnlocks(unlocks: readonly UnlockRecord[]): UnlockRecord[] {
  return unlocks.map((entry) => ({ ...entry }));
}

export type UnlockOutcome =
  | { readonly kind: 'unlocked'; readonly data: ProgressData }
  | { readonly kind: 'insufficient'; readonly shortBy: number }
  | { readonly kind: 'already' }
  | { readonly kind: 'invalid' };

/** Spends the Price, records the Unlock and equips it. Changes nothing otherwise. */
export function unlock(data: ProgressData, request: UnlockRequest): UnlockOutcome {
  const { id, kind, price } = request as Partial<UnlockRequest>;
  if (!isOptionId(id) || !isUnlockKind(kind) || !isPrice(price)) return { kind: 'invalid' };
  if (data.unlocks.some((entry) => entry.id === id)) return { kind: 'already' };
  if (price > data.candy) return { kind: 'insufficient', shortBy: price - data.candy };
  const coach = copyCoach(data.coach);
  const equipped: CoachCustomisation =
    kind === 'color'
      ? { ...coach, color: id }
      : {
          ...coach,
          // A Coach color is never an Accessory id (the codec drops such a color on load).
          color: coach.color === id ? null : coach.color,
          accessories: coach.accessories.includes(id) ? coach.accessories : [...coach.accessories, id],
        };
  return {
    kind: 'unlocked',
    data: {
      ...data,
      candy: data.candy - price,
      history: [...data.history],
      unlocks: [...copyUnlocks(data.unlocks), { id, kind, candySpent: price }],
      coach: equipped,
    },
  };
}

function isAccessoryUnlocked(data: ProgressData, id: string): boolean {
  return data.unlocks.some((entry) => entry.id === id && entry.kind === 'accessory');
}

export function equipColor(
  data: ProgressData,
  id: string | null,
): ProgressData | 'unchanged' | 'invalid' {
  if (id !== null && (!isOptionId(id) || isAccessoryUnlocked(data, id))) return 'invalid';
  if (data.coach.color === id) return 'unchanged';
  return {
    ...data,
    history: [...data.history],
    unlocks: copyUnlocks(data.unlocks),
    coach: { ...copyCoach(data.coach), color: id },
  };
}

export function setAccessoryEquipped(
  data: ProgressData,
  id: string,
  equipped: boolean,
): ProgressData | 'unchanged' | 'invalid' | 'locked' {
  if (!isOptionId(id) || typeof equipped !== 'boolean') return 'invalid';
  const worn = data.coach.accessories.includes(id);
  if (equipped) {
    if (!isAccessoryUnlocked(data, id)) return 'locked';
    if (worn) return 'unchanged';
  } else if (!worn) {
    return 'unchanged';
  }
  const coach = copyCoach(data.coach);
  return {
    ...data,
    history: [...data.history],
    unlocks: copyUnlocks(data.unlocks),
    coach: {
      ...coach,
      accessories: equipped
        ? [...coach.accessories, id]
        : coach.accessories.filter((entry) => entry !== id),
    },
  };
}

/** `data` null in the result means the name is unchanged. */
export function setCoachName(
  data: ProgressData,
  text: string,
): { readonly data: ProgressData | null; readonly name: string | null } | 'invalid' {
  if (typeof text !== 'string') return 'invalid';
  const name = normaliseCoachName(text);
  if (name === 'invalid') return 'invalid';
  if (data.coach.name === name) return { data: null, name };
  return {
    name,
    data: {
      ...data,
      history: [...data.history],
      unlocks: copyUnlocks(data.unlocks),
      coach: { ...copyCoach(data.coach), name },
    },
  };
}

/** The envelope the store can judge: version 1 and a workout object with a routine id. */
export function isCheckpointEnvelope(value: unknown): value is WorkoutCheckpoint {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const envelope = value as Record<string, unknown>;
  if (envelope.version !== 1) return false;
  const workout = envelope.workout;
  if (typeof workout !== 'object' || workout === null || Array.isArray(workout)) return false;
  return isNonEmptyText((workout as Record<string, unknown>).routineId);
}

export function withCheckpoint(
  data: ProgressData,
  checkpoint: WorkoutCheckpoint,
): ProgressData | 'invalid' {
  if (!isCheckpointEnvelope(checkpoint)) return 'invalid';
  return carry(data, { checkpoint });
}

/** Copies the arrays and objects so a result never shares them with its input. */
function carry(data: ProgressData, changes: Partial<ProgressData>): ProgressData {
  return {
    ...data,
    history: [...data.history],
    unlocks: copyUnlocks(data.unlocks),
    coach: copyCoach(data.coach),
    ...changes,
  };
}

/** Null when there is no checkpoint to clear. */
export function withoutCheckpoint(data: ProgressData): ProgressData | null {
  if (data.checkpoint === null) return null;
  return carry(data, { checkpoint: null });
}

export type FinishOutcome =
  | { readonly kind: 'recorded'; readonly data: ProgressData }
  | { readonly kind: 'duplicate'; readonly data: ProgressData | null } // null: nothing to change
  | { readonly kind: 'invalid' };

/** Records the Workout and clears the checkpoint in one step. */
export function finishWorkout(data: ProgressData, record: WorkoutRecord): FinishOutcome {
  if (!validateRecord(record)) return { kind: 'invalid' };
  if (data.history.some((entry) => entry.id === record.id)) {
    return { kind: 'duplicate', data: withoutCheckpoint(data) };
  }
  return {
    kind: 'recorded',
    data: carry(data, {
      candy: data.candy + record.candyEarned,
      history: [...data.history, { ...record }],
      checkpoint: null,
    }),
  };
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function validateRecord(value: unknown): value is WorkoutRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const { finishedAt, candyEarned, outcome } = record;
  return (
    isNonEmptyText(record.id) &&
    isNonEmptyText(record.routineId) &&
    typeof finishedAt === 'number' &&
    Number.isInteger(finishedAt) &&
    finishedAt >= 0 &&
    finishedAt <= maxFinishedAt &&
    typeof candyEarned === 'number' &&
    Number.isSafeInteger(candyEarned) &&
    candyEarned >= 0 &&
    typeof outcome === 'string' &&
    (outcomes as readonly string[]).includes(outcome)
  );
}

/** Returns the new data, or null when the Welcome gift was already granted. */
export function grantWelcomeGift(data: ProgressData): ProgressData | null {
  if (data.welcomeGiftGranted) return null;
  return carry(data, { candy: data.candy + welcomeGiftCandy, welcomeGiftGranted: true });
}

export function recordWorkout(
  data: ProgressData,
  record: WorkoutRecord,
): ProgressData | 'invalid' | 'duplicate' {
  if (!validateRecord(record)) return 'invalid';
  if (data.history.some((entry) => entry.id === record.id)) return 'duplicate';
  return carry(data, {
    candy: data.candy + record.candyEarned,
    history: [...data.history, { ...record }],
  });
}

export function totalCandyEarned(data: ProgressData): number {
  return data.history.reduce((sum, entry) => sum + entry.candyEarned, 0);
}

export function snapshotOf(data: ProgressData, persistent: boolean): ProgressSnapshot {
  return {
    schemaVersion: data.schemaVersion,
    candyBalance: data.candy,
    welcomeGiftGranted: data.welcomeGiftGranted,
    history: data.history.map((entry) => ({ ...entry })).reverse(),
    totalCandyEarned: totalCandyEarned(data),
    totalCandySpent: totalCandySpent(data),
    unlocks: copyUnlocks(data.unlocks),
    coach: copyCoach(data.coach),
    persistent,
    // Plain JSON-safe data: a round trip gives the caller a copy.
    checkpoint:
      data.checkpoint === null
        ? null
        : (JSON.parse(JSON.stringify(data.checkpoint)) as WorkoutCheckpoint),
  };
}
