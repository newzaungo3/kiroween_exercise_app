import { isCheckpointEnvelope, validateRecord } from './rules';
import { schemaVersion, type ProgressData, type WorkoutRecord } from './types';

/*
 * Codec for the Progress_Data text. Version table:
 *   version < 1   no data
 *   1             migrates to 2 with checkpoint null
 *   2             reads the checkpoint member: missing => no data, null => null,
 *                 an envelope is kept, anything else => null while the core is kept
 *   version > 2   newer (decided before any shape check)
 * The next schema version adds one row here.
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
    return { kind: 'data', data: { schemaVersion: 2, ...core, checkpoint: null } };
  }

  const checkpoint = object.checkpoint;
  if (checkpoint === undefined) return { kind: 'none' };
  return {
    kind: 'data',
    data: {
      schemaVersion: 2,
      ...core,
      checkpoint: isCheckpointEnvelope(checkpoint) ? checkpoint : null,
    },
  };
}
