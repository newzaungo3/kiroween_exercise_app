import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createProgressStore, storageKey } from '@/progress-store';
import type { WorkoutRecord } from '@/progress-store';
import { recordWorkout, validateRecord, emptyProgress } from '@/progress-store/rules';
import {
  createSpyAdapter,
  operationSequenceArbitrary,
  runOperations,
  workoutRecordArbitrary,
} from './support/progress';

const numRuns = 200;

/** An independent statement of the validity conditions for a Workout record. */
function oracleIsValid(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  const nonEmpty = (x: unknown): boolean => typeof x === 'string' && x !== '';
  const finishedAtOk =
    typeof r.finishedAt === 'number' &&
    Number.isInteger(r.finishedAt) &&
    r.finishedAt >= 0 &&
    r.finishedAt <= 8_640_000_000_000_000;
  const candyOk =
    typeof r.candyEarned === 'number' &&
    Number.isInteger(r.candyEarned) &&
    r.candyEarned >= 0 &&
    r.candyEarned <= Number.MAX_SAFE_INTEGER;
  const outcomeOk = r.outcome === 'completed' || r.outcome === 'partial' || r.outcome === 'abandoned';
  return nonEmpty(r.id) && nonEmpty(r.routineId) && finishedAtOk && candyOk && outcomeOk;
}

/** A record whose fields may be valid or broken in each of the ways the rule names. */
const looseRecordArbitrary = fc.record({
  id: fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 12 })),
  routineId: fc.oneof(fc.constant(''), fc.constantFrom('graveyard-shift', 'witching-hour')),
  finishedAt: fc.oneof(
    { weight: 6, arbitrary: fc.integer({ min: 0, max: 4_000_000_000_000 }) },
    { weight: 1, arbitrary: fc.integer({ min: -1000, max: -1 }) },
    { weight: 1, arbitrary: fc.double({ noInteger: true, min: 0, max: 1e6, noNaN: true }) },
    { weight: 1, arbitrary: fc.constantFrom(8_640_000_000_000_000, 8_640_000_000_000_001, Number.NaN) },
  ),
  outcome: fc.oneof(
    { weight: 6, arbitrary: fc.constantFrom('completed', 'partial', 'abandoned') },
    { weight: 1, arbitrary: fc.constantFrom('perfect', '', 'Completed') },
  ),
  candyEarned: fc.oneof(
    { weight: 6, arbitrary: fc.integer({ min: 0, max: 60 }) },
    { weight: 1, arbitrary: fc.integer({ min: -60, max: -1 }) },
    { weight: 1, arbitrary: fc.double({ noInteger: true, min: 0, max: 60, noNaN: true }) },
    { weight: 1, arbitrary: fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53) },
  ),
});

function record(overrides: Partial<WorkoutRecord> = {}): WorkoutRecord {
  return {
    id: 'graveyard-shift:1000',
    routineId: 'graveyard-shift',
    finishedAt: 1000,
    outcome: 'completed',
    candyEarned: 14,
    ...overrides,
  };
}

function storedHistory(adapter: ReturnType<typeof createSpyAdapter>): WorkoutRecord[] {
  const text = adapter.backing.getItem(storageKey);
  return (JSON.parse(text ?? '{}') as { history?: WorkoutRecord[] }).history ?? [];
}

describe('recording a Workout', () => {
  it('a valid record adds its Candy once, as the newest entry, with one write', () => {
    // Feature: candy-and-history, Property 5: Recording a valid record adds its Candy once
    // **Validates: Requirements 4.1, 4.5**
    fc.assert(
      fc.property(
        operationSequenceArbitrary({ distinctRecords: true }),
        workoutRecordArbitrary,
        (operations, candidate) => {
          const adapter = createSpyAdapter();
          const { store } = runOperations(adapter, operations);
          const before = store.snapshot();
          fc.pre(!before.history.some((entry) => entry.id === candidate.id));
          const writesBefore = adapter.setItemCalls();

          const result = store.recordWorkout(candidate);

          expect(result).toEqual({
            recorded: true,
            candyBalance: before.candyBalance + candidate.candyEarned,
          });
          expect(adapter.setItemCalls()).toBe(writesBefore + 1);
          const after = store.snapshot();
          expect(after.candyBalance).toBe(before.candyBalance + candidate.candyEarned);
          expect(after.history[0]).toEqual(candidate);
          expect(after.history).toHaveLength(before.history.length + 1);
          const stored = JSON.parse(adapter.backing.getItem(storageKey) ?? '{}') as {
            candy: number;
            history: WorkoutRecord[];
          };
          expect(stored.candy).toBe(after.candyBalance);
          expect(stored.history[stored.history.length - 1]).toEqual(candidate);
        },
      ),
      { numRuns },
    );
  });

  it('rejected records change nothing and validateRecord matches the rule', () => {
    // Feature: candy-and-history, Property 6: Rejected records change nothing
    // **Validates: Requirements 4.2, 4.3, 4.4, 4.6, 4.7**
    fc.assert(
      fc.property(
        operationSequenceArbitrary({ distinctRecords: true }),
        looseRecordArbitrary,
        fc.boolean(),
        fc.nat(),
        fc.integer({ min: 0, max: 60 }),
        (operations, loose, useDuplicate, pick, otherCandy) => {
          const adapter = createSpyAdapter();
          const { store } = runOperations(adapter, operations);
          const history = store.snapshot().history;
          const candidate: unknown =
            useDuplicate && history.length > 0
              ? { ...history[pick % history.length], candyEarned: otherCandy }
              : loose;

          expect(validateRecord(candidate)).toBe(oracleIsValid(candidate));

          const isDuplicate =
            oracleIsValid(candidate) &&
            history.some((entry) => entry.id === (candidate as WorkoutRecord).id);
          if (oracleIsValid(candidate) && !isDuplicate) return; // accepted: covered by Property 5

          const snapshotBefore = store.snapshot();
          const textBefore = adapter.backing.getItem(storageKey);
          const writesBefore = adapter.setItemCalls();

          const result = store.recordWorkout(candidate as WorkoutRecord);

          expect(result).toEqual({
            recorded: false,
            reason: isDuplicate ? 'duplicate' : 'invalid',
          });
          expect(store.snapshot()).toEqual(snapshotBefore);
          expect(adapter.backing.getItem(storageKey)).toBe(textBefore);
          expect(adapter.setItemCalls()).toBe(writesBefore);
        },
      ),
      { numRuns },
    );
  });

  it('a completed Workout adds 14 Candy', () => {
    const adapter = createSpyAdapter();
    const store = createProgressStore(adapter);
    expect(store.recordWorkout(record({ candyEarned: 14 }))).toEqual({
      recorded: true,
      candyBalance: 14,
    });
    expect(adapter.setItemCalls()).toBe(1);
  });

  it('a partial Workout adds its Candy', () => {
    const store = createProgressStore(createSpyAdapter());
    const result = store.recordWorkout(record({ outcome: 'partial', candyEarned: 8 }));
    expect(result).toEqual({ recorded: true, candyBalance: 8 });
    expect(store.snapshot().history[0]?.outcome).toBe('partial');
  });

  it('an abandoned Workout adds the Candy for the confirmed Sets', () => {
    const store = createProgressStore(createSpyAdapter());
    const result = store.recordWorkout(record({ outcome: 'abandoned', candyEarned: 3 }));
    expect(result).toEqual({ recorded: true, candyBalance: 3 });
    expect(store.snapshot().history[0]?.outcome).toBe('abandoned');
  });

  it('a Workout with 0 Candy is recorded', () => {
    const adapter = createSpyAdapter();
    const store = createProgressStore(adapter);
    expect(store.recordWorkout(record({ outcome: 'abandoned', candyEarned: 0 }))).toEqual({
      recorded: true,
      candyBalance: 0,
    });
    expect(store.snapshot().history).toHaveLength(1);
    expect(storedHistory(adapter)).toHaveLength(1);
  });

  const invalidFields: ReadonlyArray<readonly [string, Partial<WorkoutRecord>]> = [
    ['an empty id', { id: '' }],
    ['an empty Routine id', { routineId: '' }],
    ['a negative Candy', { candyEarned: -1 }],
    ['a fraction of Candy', { candyEarned: 1.5 }],
    ['an unknown outcome', { outcome: 'perfect' as unknown as WorkoutRecord['outcome'] }],
    ['a finishedAt below the range', { finishedAt: -1 }],
    ['a finishedAt above the range', { finishedAt: 8_640_000_000_000_001 }],
  ];

  it.each(invalidFields)('a record with %s is rejected and nothing is written', (_name, fields) => {
    const adapter = createSpyAdapter();
    const store = createProgressStore(adapter);
    const before = store.snapshot();
    expect(store.recordWorkout(record(fields))).toEqual({ recorded: false, reason: 'invalid' });
    expect(store.snapshot()).toEqual(before);
    expect(adapter.setItemCalls()).toBe(0);
    expect(recordWorkout(emptyProgress, record(fields))).toBe('invalid');
  });

  it('a record with a repeated id is rejected as a duplicate', () => {
    const adapter = createSpyAdapter();
    const store = createProgressStore(adapter);
    store.recordWorkout(record());
    const writes = adapter.setItemCalls();
    expect(store.recordWorkout(record({ candyEarned: 5 }))).toEqual({
      recorded: false,
      reason: 'duplicate',
    });
    expect(adapter.setItemCalls()).toBe(writes);
    expect(store.snapshot().candyBalance).toBe(14);
  });
});
