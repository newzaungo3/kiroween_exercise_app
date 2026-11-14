import { validateRecord } from './rules';
import { schemaVersion, type ProgressData, type WorkoutRecord } from './types';

/*
 * Codec for the Progress_Data text. When schema version 2 exists, add a
 * version table here that migrates older data before the shape check.
 */

export type ParsedProgress =
  | { readonly kind: 'data'; readonly data: ProgressData }
  | { readonly kind: 'none' } // no text, not JSON, or the wrong shape
  | { readonly kind: 'newer'; readonly version: number };

export function serialiseProgress(data: ProgressData): string {
  return JSON.stringify(data);
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
  if (version < schemaVersion) return { kind: 'none' };

  const { candy, welcomeGiftGranted, history } = object;
  if (typeof candy !== 'number' || !Number.isSafeInteger(candy) || candy < 0) {
    return { kind: 'none' };
  }
  if (typeof welcomeGiftGranted !== 'boolean') return { kind: 'none' };
  if (!Array.isArray(history)) return { kind: 'none' };

  const ids = new Set<string>();
  const records: WorkoutRecord[] = [];
  for (const entry of history as unknown[]) {
    if (!validateRecord(entry) || ids.has(entry.id)) return { kind: 'none' };
    ids.add(entry.id);
    records.push({
      id: entry.id,
      routineId: entry.routineId,
      finishedAt: entry.finishedAt,
      outcome: entry.outcome,
      candyEarned: entry.candyEarned,
    });
  }
  return {
    kind: 'data',
    data: { schemaVersion, candy, welcomeGiftGranted, history: records },
  };
}
