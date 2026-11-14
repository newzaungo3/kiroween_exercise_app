import { normaliseCoachName } from './coach-name';
import {
  defaultCoach,
  isCheckpointEnvelope,
  isOptionId,
  isUnlockRecord,
  validateRecord,
} from './rules';
import {
  schemaVersion,
  type CoachCustomisation,
  type ProgressData,
  type UnlockRecord,
  type WorkoutRecord,
} from './types';

/*
 * Codec for the Progress_Data text. Version table:
 *   not an integer, or < 1   no data
 *   1                        core -> version 2 (checkpoint null) -> version 3
 *   2                        core + checkpoint rule -> version 3 (no unlocks, default Coach)
 *   3                        core + checkpoint rule + unlocks (missing, invalid or a repeated
 *                            id => no data) + coach (missing => no data; each member repaired
 *                            on its own)
 *   version > 3              newer (decided before any shape check)
 * The checkpoint rule: missing => no data, null => null, an envelope is kept, anything else =>
 * null while the core is kept. The next schema version adds one row here.
 */

export type ParsedProgress =
  | { readonly kind: 'data'; readonly data: ProgressData }
  | { readonly kind: 'none' } // no text, not JSON, or the wrong shape
  | { readonly kind: 'newer'; readonly version: number };

interface Core {
  readonly candy: number;
  readonly welcomeGiftGranted: boolean;
  readonly history: readonly WorkoutRecord[];
}

export function serialiseProgress(data: ProgressData): string {
  return JSON.stringify(data);
}

/** The members every version shares. Null when the shape is wrong. */
function parseCore(object: Record<string, unknown>): Core | null {
  const { candy, welcomeGiftGranted, history } = object;
  if (typeof candy !== 'number' || !Number.isSafeInteger(candy) || candy < 0) return null;
  if (typeof welcomeGiftGranted !== 'boolean') return null;
  if (!Array.isArray(history)) return null;

  const ids = new Set<string>();
  const records: WorkoutRecord[] = [];
  for (const entry of history as unknown[]) {
    if (!validateRecord(entry) || ids.has(entry.id)) return null;
    ids.add(entry.id);
    records.push({
      id: entry.id,
      routineId: entry.routineId,
      finishedAt: entry.finishedAt,
      outcome: entry.outcome,
      candyEarned: entry.candyEarned,
    });
  }
  return { candy, welcomeGiftGranted, history: records };
}

/** Null when the list is not a list of valid, distinct Unlock_Records. */
function parseUnlocks(value: unknown): UnlockRecord[] | null {
  if (!Array.isArray(value)) return null;
  const ids = new Set<string>();
  const records: UnlockRecord[] = [];
  for (const entry of value as unknown[]) {
    if (!isUnlockRecord(entry) || ids.has(entry.id)) return null;
    ids.add(entry.id);
    records.push({ id: entry.id, kind: entry.kind, candySpent: entry.candySpent });
  }
  return records;
}

/** Repairs each member on its own; never loses Candy or Unlocks. */
function parseCoach(value: unknown, unlocks: readonly UnlockRecord[]): CoachCustomisation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ...defaultCoach, accessories: [] };
  }
  const object = value as Record<string, unknown>;
  const accessoryIds = new Set(
    unlocks.filter((entry) => entry.kind === 'accessory').map((entry) => entry.id),
  );

  const name =
    typeof object.name === 'string' && normaliseCoachName(object.name) === object.name
      ? object.name
      : null;
  const color =
    isOptionId(object.color) && !accessoryIds.has(object.color) ? object.color : null;

  const accessories: string[] = [];
  if (Array.isArray(object.accessories)) {
    for (const id of object.accessories as unknown[]) {
      if (typeof id === 'string' && accessoryIds.has(id) && !accessories.includes(id)) {
        accessories.push(id);
      }
    }
  }
  return { name, color, accessories };
}

/** Never throws. */
export function parseProgress(text: string | null): ParsedProgress {
  if (text === null) return { kind: 'none' };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { kind: 'none' };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { kind: 'none' };
  }
  const object = value as Record<string, unknown>;
  const version = object.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version)) return { kind: 'none' };
  if (version > schemaVersion) return { kind: 'newer', version };
  if (version < 1) return { kind: 'none' };

  const core = parseCore(object);
  if (core === null) return { kind: 'none' };

  if (version === 1) {
    return {
      kind: 'data',
      data: {
        schemaVersion: 3,
        ...core,
        checkpoint: null,
        unlocks: [],
        coach: { ...defaultCoach, accessories: [] },
      },
    };
  }

  const checkpoint = object.checkpoint;
  if (checkpoint === undefined) return { kind: 'none' };
  const kept = isCheckpointEnvelope(checkpoint) ? checkpoint : null;

  if (version === 2) {
    return {
      kind: 'data',
      data: {
        schemaVersion: 3,
        ...core,
        checkpoint: kept,
        unlocks: [],
        coach: { ...defaultCoach, accessories: [] },
      },
    };
  }

  const unlocks = parseUnlocks(object.unlocks);
  if (unlocks === null) return { kind: 'none' };
  if (object.coach === undefined) return { kind: 'none' };
  return {
    kind: 'data',
    data: {
      schemaVersion: 3,
      ...core,
      checkpoint: kept,
      unlocks,
      coach: parseCoach(object.coach, unlocks),
    },
  };
}
