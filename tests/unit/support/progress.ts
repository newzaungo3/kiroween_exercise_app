/**
 * Test support for the Progress store: arbitraries, a model of the expected
 * state, a spy Storage adapter and a runner that applies operations.
 * No real time is read.
 */
import fc from 'fast-check';
import {
  createMemoryStorage,
  createProgressStore,
  isOptionId,
  maxUnlockPrice,
  normaliseCoachName,
  schemaVersion,
  welcomeGiftCandy,
} from '@/progress-store';
import { cryptContent } from '@/catalog';
import { checkpointOf } from '@/workout-engine';
import type { WorkoutCheckpoint } from '@/workout-engine';
import { unfinishedWorkoutArbitrary } from './workout';
import type {
  CoachCustomisation,
  CoachNameResult,
  EquipResult,
  MemoryStorage,
  ProgressData,
  SaveCheckpointResult,
  ProgressSnapshot,
  ProgressStore,
  RecordResult,
  StorageAdapter,
  UnlockKind,
  UnlockRecord,
  UnlockRequest,
  UnlockResult,
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

/** The default Coach_Customisation: default name and color, no Accessory. */
export const defaultCoachData: CoachCustomisation = { name: null, color: null, accessories: [] };

/**
 * ProgressData at the current Schema_Version (3): no checkpoint, no Unlocks and
 * the default Coach_Customisation unless the fields say otherwise.
 */
export function progressDataOf(
  fields: Partial<Omit<ProgressData, 'schemaVersion'>> = {},
): ProgressData {
  return {
    schemaVersion,
    candy: 0,
    welcomeGiftGranted: false,
    history: [],
    checkpoint: null,
    unlocks: [],
    coach: defaultCoachData,
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

/** Version 2 data: a checkpoint member, no Unlocks and no Coach_Customisation. */
export interface V2Data {
  readonly schemaVersion: 2;
  readonly candy: number;
  readonly welcomeGiftGranted: boolean;
  readonly history: readonly WorkoutRecord[];
  readonly checkpoint: WorkoutCheckpoint | null;
}

export const v2DataArbitrary: fc.Arbitrary<V2Data> = fc.record({
  schemaVersion: fc.constant<2>(2),
  candy: fc.integer({ min: 0, max: 1_000_000 }),
  welcomeGiftGranted: fc.boolean(),
  history: distinctRecordsArbitrary(),
  checkpoint: fc.oneof(fc.constant<WorkoutCheckpoint | null>(null), checkpointArbitrary),
});

/** Stored text of version 2 data. */
export const v2TextArbitrary: fc.Arbitrary<string> = v2DataArbitrary.map((data) =>
  JSON.stringify(data),
);

/** Option_Ids of the shipped Crypt_Content. */
export const shippedColorIds: readonly string[] = cryptContent.coachColors.map((entry) => entry.id);
export const shippedAccessoryIds: readonly string[] = cryptContent.accessories.map(
  (entry) => entry.id,
);

/** A shipped Unlock option with its Price (the Free_Coach_Colors have no Price and are left out). */
export const shippedUnlockRequests: readonly UnlockRequest[] = [
  ...cryptContent.coachColors
    .filter((entry) => entry.price > 0)
    .map((entry) => ({ id: entry.id, kind: 'color' as const, price: entry.price })),
  ...cryptContent.accessories.map((entry) => ({
    id: entry.id,
    kind: 'accessory' as const,
    price: entry.price,
  })),
];

const optionIdArbitrary: fc.Arbitrary<string> = fc.stringMatching(/^[a-z][a-z0-9-]{0,39}$/);

/** A shipped Option_Id or a random valid one. */
const anyOptionIdArbitrary: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(...shippedColorIds, ...shippedAccessoryIds) },
  { weight: 1, arbitrary: optionIdArbitrary },
);

const unlockKindArbitrary: fc.Arbitrary<UnlockKind> = fc.constantFrom('color', 'accessory');

/** A shipped option with its shipped Price. */
export const shippedUnlockRequestArbitrary: fc.Arbitrary<UnlockRequest> = fc.constantFrom(
  ...shippedUnlockRequests,
);

/** A random valid request: a valid Option_Id, a kind and a Price from 1 to the highest. */
export const validUnlockRequestArbitrary: fc.Arbitrary<UnlockRequest> = fc.record({
  id: anyOptionIdArbitrary,
  kind: unlockKindArbitrary,
  price: fc.integer({ min: 1, max: maxUnlockPrice }),
});

/**
 * A request the store must call invalid. Typed as UnlockRequest because the
 * store receives such values from untyped callers; each variant breaks one member.
 */
export const malformedUnlockRequestArbitrary: fc.Arbitrary<UnlockRequest> = fc.oneof(
  fc.record({
    id: fc.oneof(
      fc.constant(''),
      fc.constant('Witch Hat'),
      fc.constant('1a'),
      fc.string({ minLength: 41 }).map((text) => `a${text}`),
    ),
    kind: unlockKindArbitrary,
    price: fc.integer({ min: 1, max: 50 }),
  }),
  fc.record({
    id: anyOptionIdArbitrary,
    // A kind outside the union, as an untyped caller could send it.
    kind: fc.constantFrom('hat', '', 'COLOR') as unknown as fc.Arbitrary<UnlockKind>,
    price: fc.integer({ min: 1, max: 50 }),
  }),
  fc.record({
    id: anyOptionIdArbitrary,
    kind: unlockKindArbitrary,
    price: fc.constantFrom(0, -1, 1.5, maxUnlockPrice + 1, Number.NaN, Infinity),
  }),
);

/** Shipped, valid or malformed Unlock requests. */
export const unlockRequestArbitrary: fc.Arbitrary<UnlockRequest> = fc.oneof(
  { weight: 4, arbitrary: shippedUnlockRequestArbitrary },
  { weight: 2, arbitrary: validUnlockRequestArbitrary },
  { weight: 1, arbitrary: malformedUnlockRequestArbitrary },
);

/** A list of Unlock records with distinct ids, valid Prices and either kind. */
export const unlockRecordsArbitrary: fc.Arbitrary<UnlockRecord[]> = fc.uniqueArray(
  fc.record({
    id: anyOptionIdArbitrary,
    kind: unlockKindArbitrary,
    candySpent: fc.integer({ min: 1, max: 60 }),
  }),
  { selector: (entry) => entry.id, maxLength: 6 },
);

const coachNameArbitrary: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant(null),
  fc.constantFrom('Count Rattle', 'Bonny', 'ผีน้อย', "O'Bone"),
);

/** A well-formed Coach_Customisation; its Accessories may repeat and need not be Unlocked. */
export const coachCustomisationArbitrary: fc.Arbitrary<CoachCustomisation> = fc.record({
  name: coachNameArbitrary,
  color: fc.oneof(fc.constant(null), anyOptionIdArbitrary),
  accessories: fc.array(anyOptionIdArbitrary, { maxLength: 5 }),
});

/** Any JSON-like value, for a damaged member. */
const junkArbitrary: fc.Arbitrary<unknown> = fc.oneof(
  fc.anything(),
  fc.constantFrom<unknown>(null, [], {}, '', 0, true, ['witch-hat', 7], '<b>x</b>', 'A'.repeat(50)),
);

/**
 * A Coach_Customisation object whose members are each valid or junk, and which
 * may miss members. Typed unknown-valued because it models stored text.
 */
export const junkCoachArbitrary: fc.Arbitrary<Record<string, unknown>> = fc
  .record({
    name: fc.oneof(coachNameArbitrary, junkArbitrary),
    color: fc.oneof(anyOptionIdArbitrary, junkArbitrary),
    accessories: fc.oneof(fc.array(anyOptionIdArbitrary, { maxLength: 5 }), junkArbitrary),
  })
  .chain((coach) =>
    fc.subarray(['name', 'color', 'accessories'] as const, { minLength: 0 }).map((keep) => {
      const result: Record<string, unknown> = {};
      for (const key of keep) result[key] = coach[key];
      return result;
    }),
  );

/** Valid Schema_Version 3 data: Unlocks, a Coach_Customisation that agrees with them, a checkpoint or null. */
export const v3DataArbitrary: fc.Arbitrary<ProgressData> = fc
  .record({
    candy: fc.integer({ min: 0, max: 1_000_000 }),
    welcomeGiftGranted: fc.boolean(),
    history: distinctRecordsArbitrary(),
    checkpoint: fc.oneof(fc.constant<WorkoutCheckpoint | null>(null), checkpointArbitrary),
    unlocks: unlockRecordsArbitrary,
    coach: coachCustomisationArbitrary,
  })
  .map(({ unlocks, coach, ...rest }) => {
    const owned = unlocks.filter((entry) => entry.kind === 'accessory').map((entry) => entry.id);
    const accessories = coach.accessories.filter(
      (id, index, all) => owned.includes(id) && all.indexOf(id) === index,
    );
    return progressDataOf({ ...rest, unlocks, coach: { ...coach, accessories } });
  });

/** Stored text of valid version 3 data. */
export const v3TextArbitrary: fc.Arbitrary<string> = v3DataArbitrary.map(storedTextOf);

/** Text for the Coach name operation: names, damaged names and random strings. */
const coachNameTextArbitrary: fc.Arbitrary<string> = fc.oneof(
  fc.string({ maxLength: 30 }),
  fc.constantFrom(
    'Count Rattle',
    '  Bone   Bob ',
    '',
    '   ',
    '<b>x</b>',
    'A'.repeat(21),
    'ผีน้อย',
    '\u2019Bone',
    '{coach}',
  ),
);

export type Operation =
  | { readonly kind: 'grant' }
  | { readonly kind: 'record'; readonly record: WorkoutRecord }
  | { readonly kind: 'saveCheckpoint'; readonly checkpoint: WorkoutCheckpoint }
  | { readonly kind: 'clearCheckpoint' }
  | { readonly kind: 'finish'; readonly record: WorkoutRecord }
  | { readonly kind: 'unlock'; readonly request: UnlockRequest }
  | { readonly kind: 'equipColor'; readonly id: string | null }
  | { readonly kind: 'setAccessoryEquipped'; readonly id: string; readonly equipped: boolean }
  | { readonly kind: 'setCoachName'; readonly text: string }
  | { readonly kind: 'reload' };

/** An id to equip: shipped, random valid or malformed. */
const equipIdArbitrary: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: anyOptionIdArbitrary },
  { weight: 1, arbitrary: fc.constantFrom('', 'Witch Hat', '1a') },
);

export const operationArbitrary: fc.Arbitrary<Operation> = fc.oneof(
  unlockRequestArbitrary.map<Operation>((request) => ({ kind: 'unlock', request })),
  fc
    .oneof(fc.constant(null), equipIdArbitrary)
    .map<Operation>((id) => ({ kind: 'equipColor', id })),
  fc
    .record({ id: equipIdArbitrary, equipped: fc.boolean() })
    .map<Operation>(({ id, equipped }) => ({ kind: 'setAccessoryEquipped', id, equipped })),
  coachNameTextArbitrary.map<Operation>((text) => ({ kind: 'setCoachName', text })),
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
  /** Oldest first. The balance is gift + earned - spent, with spent the sum of `candySpent`. */
  readonly unlocks: readonly UnlockRecord[];
  readonly coach: CoachCustomisation;
}

export const emptyModel: Model = {
  welcomeGiftGranted: false,
  candyBalance: 0,
  recorded: [],
  checkpoint: null,
  unlocks: [],
  coach: defaultCoachData,
};

/** The Candy spent on Unlocks in the model. */
export function modelTotalCandySpent(model: Model): number {
  return model.unlocks.reduce((sum, entry) => sum + entry.candySpent, 0);
}

function isValidPrice(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= maxUnlockPrice
  );
}

function isAccessoryOwned(model: Model, id: string): boolean {
  return model.unlocks.some((entry) => entry.id === id && entry.kind === 'accessory');
}

/** Applies one operation; a repeated record id changes nothing. */
export function stepModel(model: Model, operation: Operation): Model {
  switch (operation.kind) {
    case 'unlock': {
      const { id, kind, price } = operation.request;
      if (!isOptionId(id) || (kind !== 'color' && kind !== 'accessory') || !isValidPrice(price)) {
        return model;
      }
      if (model.unlocks.some((entry) => entry.id === id)) return model;
      if (price > model.candyBalance) return model;
      const coach: CoachCustomisation =
        kind === 'color'
          ? { ...model.coach, color: id }
          : {
              ...model.coach,
              color: model.coach.color === id ? null : model.coach.color,
              accessories: model.coach.accessories.includes(id)
                ? model.coach.accessories
                : [...model.coach.accessories, id],
            };
      return {
        ...model,
        candyBalance: model.candyBalance - price,
        unlocks: [...model.unlocks, { id, kind, candySpent: price }],
        coach,
      };
    }
    case 'equipColor': {
      const { id } = operation;
      if (id !== null && (!isOptionId(id) || isAccessoryOwned(model, id))) return model;
      if (model.coach.color === id) return model;
      return { ...model, coach: { ...model.coach, color: id } };
    }
    case 'setAccessoryEquipped': {
      const { id, equipped } = operation;
      if (!isOptionId(id)) return model;
      const worn = model.coach.accessories.includes(id);
      if (equipped) {
        if (!isAccessoryOwned(model, id) || worn) return model;
        return {
          ...model,
          coach: { ...model.coach, accessories: [...model.coach.accessories, id] },
        };
      }
      if (!worn) return model;
      return {
        ...model,
        coach: {
          ...model.coach,
          accessories: model.coach.accessories.filter((entry) => entry !== id),
        },
      };
    }
    case 'setCoachName': {
      const name = normaliseCoachName(operation.text);
      if (name === 'invalid') return model;
      return { ...model, coach: { ...model.coach, name } };
    }
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
  | { readonly kind: 'unlock'; readonly result: UnlockResult }
  | { readonly kind: 'equipColor'; readonly result: EquipResult }
  | { readonly kind: 'setAccessoryEquipped'; readonly result: EquipResult }
  | { readonly kind: 'setCoachName'; readonly result: CoachNameResult }
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
      case 'unlock':
        result = { kind: 'unlock', result: store.unlock(operation.request) };
        break;
      case 'equipColor':
        result = { kind: 'equipColor', result: store.equipColor(operation.id) };
        break;
      case 'setAccessoryEquipped':
        result = {
          kind: 'setAccessoryEquipped',
          result: store.setAccessoryEquipped(operation.id, operation.equipped),
        };
        break;
      case 'setCoachName':
        result = { kind: 'setCoachName', result: store.setCoachName(operation.text) };
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
