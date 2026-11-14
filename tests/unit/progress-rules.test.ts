import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createProgressStore, storageKey } from '@/progress-store';
import type { WorkoutRecord } from '@/progress-store';
import {
  recordWorkout,
  validateRecord,
  emptyProgress,
  isCheckpointEnvelope,
} from '@/progress-store/rules';
import type { WorkoutCheckpoint } from '@/workout-engine';
import {
  checkpointArbitrary,
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

/** An independent statement of what the store accepts as a checkpoint envelope. */
function oracleIsEnvelope(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const envelope = value as Record<string, unknown>;
  const workout = envelope.workout;
  return (
    envelope.version === 1 &&
    typeof workout === 'object' &&
    workout !== null &&
    !Array.isArray(workout) &&
    typeof (workout as Record<string, unknown>).routineId === 'string' &&
    (workout as Record<string, unknown>).routineId !== ''
  );
}

/** Values near the envelope rule: valid, or broken in one named way, or arbitrary JSON. */
const envelopeCandidateArbitrary: fc.Arbitrary<unknown> = fc.oneof(
  fc.jsonValue(),
  fc.record({
    version: fc.oneof(fc.constant(1), fc.constantFrom(0, 2, '1'), fc.jsonValue()),
    workout: fc.oneof(
      fc.record({ routineId: fc.oneof(fc.constant(''), fc.constant('graveyard-shift'), fc.jsonValue()) }),
      fc.constant([]),
      fc.constant(null),
      fc.jsonValue(),
    ),
  }),
  checkpointArbitrary,
);

describe('saving and finishing with a checkpoint', () => {
  it('only checkpoint envelopes are saved', () => {
    // Feature: resume-after-refresh, Property 9: Only envelopes are saved
    // **Validates: Requirements 6.3, 6.4**
    fc.assert(
      fc.property(
        operationSequenceArbitrary({ distinctRecords: true, maxLength: 8 }),
        envelopeCandidateArbitrary,
        (operations, candidate) => {
          expect(isCheckpointEnvelope(candidate)).toBe(oracleIsEnvelope(candidate));

          const adapter = createSpyAdapter();
          const { store } = runOperations(adapter, operations);
          const snapshotBefore = store.snapshot();
          const textBefore = adapter.backing.getItem(storageKey);
          const writesBefore = adapter.setItemCalls();

          const result = store.saveCheckpoint(candidate as WorkoutCheckpoint);

          if (oracleIsEnvelope(candidate)) {
            expect(result).toEqual({ saved: true });
            expect(adapter.setItemCalls()).toBe(writesBefore + 1);
          } else {
            expect(result).toEqual({ saved: false, reason: 'invalid' });
            expect(adapter.setItemCalls()).toBe(writesBefore);
            expect(adapter.backing.getItem(storageKey)).toBe(textBefore);
            expect(store.snapshot()).toEqual(snapshotBefore);
          }
        },
      ),
      { numRuns },
    );
  });

  it('finishing a Workout is atomic and idempotent', () => {
    // Feature: resume-after-refresh, Property 11: Finishing is atomic and idempotent
    // **Validates: Requirements 6.6, 6.7, 6.8, 11.4**
    fc.assert(
      fc.property(
        operationSequenceArbitrary({ distinctRecords: true, maxLength: 8 }),
        checkpointArbitrary,
        workoutRecordArbitrary,
        looseRecordArbitrary,
        fc.boolean(),
        (operations, checkpoint, candidate, loose, withCheckpoint) => {
          const adapter = createSpyAdapter();
          const { store } = runOperations(adapter, operations);
          fc.pre(!store.snapshot().history.some((entry) => entry.id === candidate.id));

          // Invalid record: nothing changes, nothing is written.
          if (withCheckpoint) store.saveCheckpoint(checkpoint);
          if (!oracleIsValid(loose)) {
            const snapshotBefore = store.snapshot();
            const writes = adapter.setItemCalls();
            expect(store.finishWorkout(loose as WorkoutRecord)).toEqual({
              recorded: false,
              reason: 'invalid',
            });
            expect(store.snapshot()).toEqual(snapshotBefore);
            expect(adapter.setItemCalls()).toBe(writes);
          }

          // First finish: Candy once, record appended, checkpoint cleared, one write.
          const before = store.snapshot();
          const writesBefore = adapter.setItemCalls();
          expect(store.finishWorkout(candidate)).toEqual({
            recorded: true,
            candyBalance: before.candyBalance + candidate.candyEarned,
          });
          expect(adapter.setItemCalls()).toBe(writesBefore + 1);
          const after = store.snapshot();
          expect(after.checkpoint).toBeNull();
          expect(after.candyBalance).toBe(before.candyBalance + candidate.candyEarned);
          expect(after.history[0]).toEqual(candidate);
          expect(after.history).toHaveLength(before.history.length + 1);

          // Duplicate without a checkpoint: no write, nothing changes.
          const writesAfterFirst = adapter.setItemCalls();
          expect(store.finishWorkout(candidate)).toEqual({ recorded: false, reason: 'duplicate' });
          expect(adapter.setItemCalls()).toBe(writesAfterFirst);
          expect(store.snapshot()).toEqual(after);

          // Duplicate with a stale checkpoint: cleared with one write, no Candy.
          store.saveCheckpoint(checkpoint);
          const writesStale = adapter.setItemCalls();
          expect(store.finishWorkout(candidate)).toEqual({ recorded: false, reason: 'duplicate' });
          expect(adapter.setItemCalls()).toBe(writesStale + 1);
          const cleared = store.snapshot();
          expect(cleared.checkpoint).toBeNull();
          expect(cleared.candyBalance).toBe(after.candyBalance);
          expect(cleared.history).toEqual(after.history);
        },
      ),
      { numRuns },
    );
  });

  it('a finished Workout adds its Candy and clears the checkpoint in one write', () => {
    const adapter = createSpyAdapter();
    const store = createProgressStore(adapter);
    store.saveCheckpoint(checkpointExample());
    const writes = adapter.setItemCalls();
    expect(store.finishWorkout(record())).toEqual({ recorded: true, candyBalance: 14 });
    expect(adapter.setItemCalls()).toBe(writes + 1);
    expect(store.snapshot().checkpoint).toBeNull();
    expect(JSON.parse(adapter.backing.getItem(storageKey) ?? '{}')).toMatchObject({
      candy: 14,
      checkpoint: null,
    });
  });

  it('finishing a Workout twice records it once', () => {
    const store = createProgressStore(createSpyAdapter());
    store.finishWorkout(record());
    expect(store.finishWorkout(record())).toEqual({ recorded: false, reason: 'duplicate' });
    expect(store.snapshot().history).toHaveLength(1);
    expect(store.snapshot().candyBalance).toBe(14);
  });

  it('a duplicate finish clears a stale checkpoint and adds no Candy', () => {
    const adapter = createSpyAdapter();
    const store = createProgressStore(adapter);
    store.finishWorkout(record());
    store.saveCheckpoint(checkpointExample());
    const writes = adapter.setItemCalls();
    expect(store.finishWorkout(record({ candyEarned: 9 }))).toEqual({
      recorded: false,
      reason: 'duplicate',
    });
    expect(adapter.setItemCalls()).toBe(writes + 1);
    expect(store.snapshot().checkpoint).toBeNull();
    expect(store.snapshot().candyBalance).toBe(14);
  });
});

function checkpointExample(): WorkoutCheckpoint {
  return fc.sample(checkpointArbitrary, { numRuns: 1, seed: 7 })[0] as WorkoutCheckpoint;
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
