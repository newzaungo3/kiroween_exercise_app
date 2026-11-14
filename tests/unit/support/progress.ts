/**
 * Test support for the Progress store: arbitraries, a model of the expected
 * state, a spy Storage adapter and a runner that applies operations.
 * No real time is read.
 */
import fc from 'fast-check';
import {
  createMemoryStorage,
  createProgressStore,
  schemaVersion,
  welcomeGiftCandy,
} from '@/progress-store';
import { checkpointOf } from '@/workout-engine';
import type { WorkoutCheckpoint } from '@/workout-engine';
import { unfinishedWorkoutArbitrary } from './workout';
import type {
  MemoryStorage,
  ProgressData,
  SaveCheckpointResult,
  ProgressSnapshot,
  ProgressStore,
  RecordResult,
  StorageAdapter,
  WorkoutRecord,
} from '@/progress-store';

const outcomes = ['completed', 'partial', 'abandoned'] as const;

const routineIds = ['graveyard-shift', 'witching-hour', 'moonlight-stretch'] as const;

/** One valid Workout record; the id follows the `routineId:finishedAt` rule. */
export const workoutRecordArbitrary: fc.Arbitrary<WorkoutRecord> = fc
  .record({
    routineId: fc.constantFrom(...routineIds),
    finishedAt: fc.integer({ min: 0, max: 4_000_000_000_000 }),
    outcome: fc.constantFrom(...outcomes),
    candyEarned: fc.integer({ min: 0, max: 60 }),
  })
  .map((fields) => ({ ...fields, id: `${fields.routineId}:${fields.finishedAt}` }));

/** A list of valid records whose ids are all different. */
export function distinctRecordsArbitrary(
  options: { minLength?: number; maxLength?: number } = {},
): fc.Arbitrary<WorkoutRecord[]> {
  return fc.uniqueArray(workoutRecordArbitrary, {
    selector: (record) => record.id,
    minLength: options.minLength ?? 0,
    maxLength: options.maxLength ?? 12,
  });
}

/** A checkpoint made by the engine from a Workout that has not reached the summary. */
export const checkpointArbitrary: fc.Arbitrary<WorkoutCheckpoint> = unfinishedWorkoutArbitrary
  .map(({ workout }) => checkpointOf(workout))
  .filter((checkpoint): checkpoint is WorkoutCheckpoint => checkpoint !== null);

/** ProgressData at the current Schema_Version (2), with a checkpoint (null by default). */
export function progressDataOf(
  fields: Partial<Omit<ProgressData, 'schemaVersion'>> = {},
): ProgressData {
  return {
    schemaVersion,
    candy: 0,
    welcomeGiftGranted: false,
    history: [],
    checkpoint: null,
    ...fields,
  } as ProgressData;
}

/** The stored text of ProgressData, as the store writes it. */
export function storedTextOf(data: ProgressData): string {
  return JSON.stringify(data);
}

/** Version 1 data: no checkpoint member. */
export interface V1Data {
  readonly schemaVersion: 1;
  readonly candy: number;
  readonly welcomeGiftGranted: boolean;
  readonly history: readonly WorkoutRecord[];
}

export const v1DataArbitrary: fc.Arbitrary<V1Data> = fc.record({
  schemaVersion: fc.constant<1>(1),
  candy: fc.integer({ min: 0, max: 1_000_000 }),
  welcomeGiftGranted: fc.boolean(),
  history: distinctRecordsArbitrary(),
});

/** Stored text of version 1 data. */
export const v1TextArbitrary: fc.Arbitrary<string> = v1DataArbitrary.map((data) =>
  JSON.stringify(data),
);

export type Operation =
  | { readonly kind: 'grant' }
  | { readonly kind: 'record'; readonly record: WorkoutRecord }
  | { readonly kind: 'saveCheckpoint'; readonly checkpoint: WorkoutCheckpoint }
  | { readonly kind: 'clearCheckpoint' }
  | { readonly kind: 'finish'; readonly record: WorkoutRecord }
  | { readonly kind: 'reload' };

export const operationArbitrary: fc.Arbitrary<Operation> = fc.oneof(
  fc.constant<Operation>({ kind: 'grant' }),
  fc.constant<Operation>({ kind: 'reload' }),
  fc.constant<Operation>({ kind: 'clearCheckpoint' }),
  workoutRecordArbitrary.map<Operation>((record) => ({ kind: 'record', record })),
  workoutRecordArbitrary.map<Operation>((record) => ({ kind: 'finish', record })),
  checkpointArbitrary.map<Operation>((checkpoint) => ({ kind: 'saveCheckpoint', checkpoint })),
);

export function operationSequenceArbitrary(
  options: { maxLength?: number; distinctRecords?: boolean } = {},
): fc.Arbitrary<Operation[]> {
  const maxLength = options.maxLength ?? 20;
  const sequence = fc.array(operationArbitrary, { maxLength });
  if (options.distinctRecords !== true) return sequence;
  return sequence.map((operations) => {
    const seen = new Set<string>();
    return operations.filter((operation) => {
      if (operation.kind !== 'record' && operation.kind !== 'finish') return true;
      if (seen.has(operation.record.id)) return false;
      seen.add(operation.record.id);
      return true;
    });
  });
}

/** What the store should report, derived only from the operations so far. */
export interface Model {
  readonly welcomeGiftGranted: boolean;
  readonly candyBalance: number;
  /** Oldest first. */
  readonly recorded: readonly WorkoutRecord[];
  /** The Stored_Checkpoint, or null. */
  readonly checkpoint: WorkoutCheckpoint | null;
}

export const emptyModel: Model = {
  welcomeGiftGranted: false,
  candyBalance: 0,
  recorded: [],
  checkpoint: null,
};

/** Applies one operation; a repeated record id changes nothing. */
export function stepModel(model: Model, operation: Operation): Model {
  switch (operation.kind) {
    case 'reload':
      return model;
    case 'grant':
      return model.welcomeGiftGranted
        ? model
        : {
            ...model,
            welcomeGiftGranted: true,
            candyBalance: model.candyBalance + welcomeGiftCandy,
          };
    case 'record':
      if (model.recorded.some((record) => record.id === operation.record.id)) return model;
      return {
        ...model,
        candyBalance: model.candyBalance + operation.record.candyEarned,
        recorded: [...model.recorded, operation.record],
      };
    case 'saveCheckpoint':
      return { ...model, checkpoint: operation.checkpoint };
    case 'clearCheckpoint':
      return { ...model, checkpoint: null };
    case 'finish':
      // A duplicate adds no Candy but still clears the checkpoint.
      if (model.recorded.some((record) => record.id === operation.record.id)) {
        return { ...model, checkpoint: null };
      }
      return {
        ...model,
        candyBalance: model.candyBalance + operation.record.candyEarned,
        recorded: [...model.recorded, operation.record],
        checkpoint: null,
      };
  }
}

export function modelAfter(operations: readonly Operation[]): Model {
  return operations.reduce(stepModel, emptyModel);
}

/** The Candy earned in Workouts: the balance without the Welcome gift. */
export function modelTotalCandyEarned(model: Model): number {
  return model.recorded.reduce((sum, record) => sum + record.candyEarned, 0);
}

export type FailureMode = 'none' | 'read' | 'write' | 'both';

export interface SpyAdapter extends StorageAdapter {
  readonly getItemCalls: () => number;
  readonly setItemCalls: () => number;
  /** Chooses which calls throw from now on. */
  readonly failOn: (mode: FailureMode) => void;
  /** The backing in-memory storage, for reading the stored text. */
  readonly backing: MemoryStorage;
}

/** Counts calls (including ones that throw) and can throw on read, write or both. */
export function createSpyAdapter(
  initial: Record<string, string> = {},
  mode: FailureMode = 'none',
): SpyAdapter {
  const backing = createMemoryStorage(initial);
  let failure = mode;
  let gets = 0;
  let sets = 0;
  return {
    getItem(key) {
      gets += 1;
      if (failure === 'read' || failure === 'both') throw new Error('read failed');
      return backing.getItem(key);
    },
    setItem(key, value) {
      sets += 1;
      if (failure === 'write' || failure === 'both') throw new Error('write failed');
      backing.setItem(key, value);
    },
    getItemCalls: () => gets,
    setItemCalls: () => sets,
    failOn: (next) => {
      failure = next;
    },
    backing,
  };
}

/** What one operation returned: the grant flag, the record result, or nothing for a reload. */
export type StepResult =
  | { readonly kind: 'grant'; readonly granted: boolean }
  | { readonly kind: 'record'; readonly result: RecordResult }
  | { readonly kind: 'saveCheckpoint'; readonly result: SaveCheckpointResult }
  | { readonly kind: 'clearCheckpoint'; readonly cleared: boolean }
  | { readonly kind: 'finish'; readonly result: RecordResult }
  | { readonly kind: 'reload' };

export interface StepOutcome {
  readonly operation: Operation;
  readonly result: StepResult;
  /** The snapshot of the store that handled the operation, after it. */
  readonly snapshot: ProgressSnapshot;
}

export interface RunOutcome {
  /** One entry per operation, in order. */
  readonly steps: readonly StepOutcome[];
  /** The store in use after the last operation. */
  readonly store: ProgressStore;
  /** Snapshot of the starting store, before any operation. */
  readonly initial: ProgressSnapshot;
}

/** Creates a store over the adapter and applies each operation; a reload creates a new store over the same adapter. */
export function runOperations(
  adapter: StorageAdapter,
  operations: readonly Operation[],
): RunOutcome {
  let store = createProgressStore(adapter);
  const initial = store.snapshot();
  const steps: StepOutcome[] = [];
  for (const operation of operations) {
    let result: StepResult;
    switch (operation.kind) {
      case 'grant':
        result = { kind: 'grant', granted: store.grantWelcomeGift() };
        break;
      case 'record':
        result = { kind: 'record', result: store.recordWorkout(operation.record) };
        break;
      case 'saveCheckpoint':
        result = { kind: 'saveCheckpoint', result: store.saveCheckpoint(operation.checkpoint) };
        break;
      case 'clearCheckpoint':
        result = { kind: 'clearCheckpoint', cleared: store.clearCheckpoint() };
        break;
      case 'finish':
        result = { kind: 'finish', result: store.finishWorkout(operation.record) };
        break;
      case 'reload':
        store = createProgressStore(adapter);
        result = { kind: 'reload' };
        break;
    }
    steps.push({ operation, result, snapshot: store.snapshot() });
  }
  return { steps, store, initial };
}
