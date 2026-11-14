import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createMemoryStorage,
  createProgressStore,
  storageKey,
  welcomeGiftCandy,
} from '@/progress-store';
import type { ProgressStore, WorkoutRecord } from '@/progress-store';
import {
  checkpointArbitrary,
  createSpyAdapter,
  progressDataOf,
  storedTextOf,
  v1DataArbitrary,
  type Model,
  type Operation,
  stepModel,
  emptyModel,
  modelAfter,
  modelTotalCandyEarned,
  modelTotalCandySpent,
  defaultCoachData,
  v2DataArbitrary,
  operationSequenceArbitrary,
  runOperations,
} from './support/progress';

function record(routineId: string, finishedAt: number, candyEarned: number): WorkoutRecord {
  return { id: `${routineId}:${finishedAt}`, routineId, finishedAt, outcome: 'completed', candyEarned };
}

describe('Progress store: persistence, Welcome gift and invariant', () => {
  // Feature: candy-and-history, Property 2: A new store over the same storage reports the same state
  // **Validates: Requirements 2.2, 2.9, 3.3**
  it('a new store over the same storage reports the same state', () => {
    fc.assert(
      fc.property(operationSequenceArbitrary(), (operations) => {
        fc.pre(!mixesColorAndAccessoryIds(operations));
        const adapter = createMemoryStorage();
        const run = runOperations(adapter, operations);
        const reloaded = createProgressStore(adapter);
        expect(reloaded.snapshot()).toEqual(run.store.snapshot());
      }),
      { numRuns: 200 },
    );
  });

  // Feature: candy-and-history, Property 3: The Welcome gift is granted at most once
  // **Validates: Requirements 3.1, 3.2, 3.5**
  it('the Welcome gift is granted at most once', () => {
    fc.assert(
      fc.property(operationSequenceArbitrary(), (operations) => {
        const run = runOperations(createMemoryStorage(), operations);
        const grants = run.steps.filter(
          (step) => step.result.kind === 'grant' && step.result.granted,
        ).length;
        const hasGrant = operations.some((operation) => operation.kind === 'grant');
        expect(grants).toBeLessThanOrEqual(1);
        expect(grants).toBe(hasGrant ? 1 : 0);
        const snapshot = run.store.snapshot();
        expect(
          snapshot.candyBalance - snapshot.totalCandyEarned + snapshot.totalCandySpent,
        ).toBe(grants === 1 ? welcomeGiftCandy : 0);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: candy-and-history, Property 4: Balance, total and order agree
  // **Validates: Requirements 3.4, 5.1, 5.2, 5.3, 5.4**
  it('the balance, the total and the order agree after every step', () => {
    fc.assert(
      fc.property(operationSequenceArbitrary(), (operations) => {
        fc.pre(!mixesColorAndAccessoryIds(operations));
        const run = runOperations(createMemoryStorage(), operations);
        run.steps.forEach((step, index) => {
          const model = modelAfter(operations.slice(0, index + 1));
          const { snapshot } = step;
          expect(snapshot.history).toEqual([...model.recorded].reverse());
          expect(snapshot.checkpoint).toEqual(model.checkpoint);
          expect(snapshot.totalCandyEarned).toBe(modelTotalCandyEarned(model));
          expect(snapshot.totalCandySpent).toBe(modelTotalCandySpent(model));
          expect(snapshot.candyBalance).toBe(
            (model.welcomeGiftGranted ? welcomeGiftCandy : 0) +
              snapshot.totalCandyEarned -
              snapshot.totalCandySpent,
          );
          expect(new Set(snapshot.history.map((entry) => entry.id)).size).toBe(
            snapshot.history.length,
          );
        });
      }),
      { numRuns: 200 },
    );
  });

  it('a fresh store has no Candy and writes nothing', () => {
    const adapter = createSpyAdapter();
    const snapshot = createProgressStore(adapter).snapshot();
    expect(snapshot.candyBalance).toBe(0);
    expect(snapshot.welcomeGiftGranted).toBe(false);
    expect(snapshot.history).toEqual([]);
    expect(adapter.setItemCalls()).toBe(0);
    expect(adapter.backing.getItem(storageKey)).toBeNull();
  });

  it('a Welcome gift is granted once and 15 Candy are added', () => {
    const store = createProgressStore(createMemoryStorage());
    expect(store.grantWelcomeGift()).toBe(true);
    expect(store.snapshot().candyBalance).toBe(15);
    expect(store.grantWelcomeGift()).toBe(false);
    expect(store.snapshot().candyBalance).toBe(15);
  });

  it('the Welcome gift is not granted again after a reload', () => {
    const adapter = createMemoryStorage();
    createProgressStore(adapter).grantWelcomeGift();
    const again = createProgressStore(adapter);
    expect(again.grantWelcomeGift()).toBe(false);
    expect(again.snapshot().candyBalance).toBe(15);
  });

  it('the Candy balance persists across a new store over the same storage', () => {
    const adapter = createMemoryStorage();
    const first = createProgressStore(adapter);
    first.grantWelcomeGift();
    first.recordWorkout(record('graveyard-shift', 1000, 14));
    const second = createProgressStore(adapter);
    expect(second.snapshot().candyBalance).toBe(29);
    expect(second.snapshot().welcomeGiftGranted).toBe(true);
  });

  it('the history lists Workouts newest first', () => {
    const store = createProgressStore(createMemoryStorage());
    store.recordWorkout(record('graveyard-shift', 1000, 3));
    store.recordWorkout(record('graveyard-shift', 2000, 8));
    store.recordWorkout(record('graveyard-shift', 3000, 14));
    expect(store.snapshot().history.map((entry) => entry.finishedAt)).toEqual([3000, 2000, 1000]);
  });

  it('the total Candy earned excludes the Welcome gift', () => {
    const store = createProgressStore(createMemoryStorage());
    store.grantWelcomeGift();
    store.recordWorkout(record('graveyard-shift', 1000, 14));
    expect(store.snapshot().totalCandyEarned).toBe(14);
    expect(store.snapshot().candyBalance).toBe(29);
  });
});

function applyOperation(store: ProgressStore, operation: Operation): void {
  switch (operation.kind) {
    case 'grant':
      store.grantWelcomeGift();
      break;
    case 'record':
      store.recordWorkout(operation.record);
      break;
    case 'saveCheckpoint':
      store.saveCheckpoint(operation.checkpoint);
      break;
    case 'clearCheckpoint':
      store.clearCheckpoint();
      break;
    case 'finish':
      store.finishWorkout(operation.record);
      break;
    case 'unlock':
      store.unlock(operation.request);
      break;
    case 'equipColor':
      store.equipColor(operation.id);
      break;
    case 'setAccessoryEquipped':
      store.setAccessoryEquipped(operation.id, operation.equipped);
      break;
    case 'setCoachName':
      store.setCoachName(operation.text);
      break;
    case 'reload':
      break;
  }
}

/** Whether the operation changes the stored data, given the model before it. */
function changesData(model: Model, operation: Operation): boolean {
  switch (operation.kind) {
    case 'reload':
      return false;
    case 'grant':
      return !model.welcomeGiftGranted;
    case 'saveCheckpoint':
      return true;
    case 'clearCheckpoint':
      return model.checkpoint !== null;
    case 'record':
      return !model.recorded.some((entry) => entry.id === operation.record.id);
    case 'finish':
      return (
        !model.recorded.some((entry) => entry.id === operation.record.id) ||
        model.checkpoint !== null
      );
    case 'unlock':
    case 'equipColor':
    case 'setAccessoryEquipped':
    case 'setCoachName':
      // The Crypt operations change the data exactly when they change the Unlocks or the Coach.
      return (
        JSON.stringify([model.unlocks, model.coach, model.candyBalance]) !==
        JSON.stringify([
          stepModel(model, operation).unlocks,
          stepModel(model, operation).coach,
          stepModel(model, operation).candyBalance,
        ])
      );
  }
}

/**
 * True when one Option_Id is equipped as a Coach color and Unlocked as an Accessory in the
 * same sequence. Shipped ids never collide across kinds, and the codec drops such a color on
 * reload, so the model does not describe that case.
 */
function mixesColorAndAccessoryIds(operations: readonly Operation[]): boolean {
  const colors = new Set<string>();
  const accessories = new Set<string>();
  for (const operation of operations) {
    if (operation.kind === 'equipColor' && operation.id !== null) colors.add(operation.id);
    if (operation.kind === 'unlock' && operation.request.kind === 'accessory') {
      accessories.add(operation.request.id);
    }
  }
  return [...colors].some((id) => accessories.has(id));
}

const sampleCheckpoint = fc.sample(checkpointArbitrary, { numRuns: 1, seed: 7 })[0]!;

describe('Progress store: the Crypt operations', () => {
  // Feature: the-crypt, Property 6: Store operations keep the Candy invariant and persist
  // **Validates: Requirements 3.6, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6**
  it('store operations keep the Candy invariant and persist', () => {
    fc.assert(
      fc.property(operationSequenceArbitrary({ maxLength: 25 }), (operations) => {
        fc.pre(!mixesColorAndAccessoryIds(operations));
        const adapter = createSpyAdapter();
        let store = createProgressStore(adapter);
        let model = emptyModel;
        for (const operation of operations) {
          const writesBefore = adapter.setItemCalls();
          const expectedWrites = changesData(model, operation) ? 1 : 0;
          if (operation.kind === 'reload') store = createProgressStore(adapter);
          const before = store.snapshot();
          applyOperation(store, operation);
          const next = stepModel(model, operation);
          const after = store.snapshot();
          expect(adapter.setItemCalls() - writesBefore).toBe(expectedWrites);
          if (operation.kind !== 'reload' && expectedWrites === 0) expect(after).toBe(before);

          // The snapshot agrees with the model.
          expect(after.unlocks).toEqual(next.unlocks);
          expect(after.coach).toEqual(next.coach);
          expect(after.candyBalance).toBe(next.candyBalance);
          expect(after.totalCandySpent).toBe(modelTotalCandySpent(next));
          expect(after.totalCandyEarned).toBe(
            after.history.reduce((sum, entry) => sum + entry.candyEarned, 0),
          );
          expect(after.candyBalance).toBe(
            (next.welcomeGiftGranted ? welcomeGiftCandy : 0) +
              after.totalCandyEarned -
              after.totalCandySpent,
          );
          expect(after.candyBalance).toBeGreaterThanOrEqual(0);

          // Unlock_Records only grow and hold each Option_Id once.
          expect(after.unlocks.slice(0, before.unlocks.length)).toEqual(before.unlocks);
          expect(new Set(after.unlocks.map((entry) => entry.id)).size).toBe(after.unlocks.length);
          // Every equipped Accessory is an Unlocked Accessory.
          for (const id of after.coach.accessories) {
            expect(after.unlocks.some((entry) => entry.id === id && entry.kind === 'accessory')).toBe(
              true,
            );
          }
          expect(new Set(after.coach.accessories).size).toBe(after.coach.accessories.length);

          // Equip and name operations leave Candy and Unlocks alone; Workout and checkpoint operations leave the Unlocks and the Coach alone.
          if (
            operation.kind === 'equipColor' ||
            operation.kind === 'setAccessoryEquipped' ||
            operation.kind === 'setCoachName'
          ) {
            expect(after.candyBalance).toBe(before.candyBalance);
            expect(after.unlocks).toEqual(before.unlocks);
          }
          if (
            operation.kind === 'record' ||
            operation.kind === 'finish' ||
            operation.kind === 'saveCheckpoint' ||
            operation.kind === 'clearCheckpoint' ||
            operation.kind === 'grant'
          ) {
            expect(after.unlocks).toEqual(before.unlocks);
            expect(after.coach).toEqual(before.coach);
          }

          model = next;
          expect(createProgressStore(adapter).snapshot()).toEqual(after);
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('Progress store: the checkpoint', () => {
  // Feature: resume-after-refresh, Property 10: Checkpoint operations persist and keep the Candy invariants
  // **Validates: Requirements 5.3, 6.2, 6.5, 6.9, 6.12, 6.13, 6.16, 6.17**
  it('checkpoint operations persist and keep the Candy invariants', () => {
    fc.assert(
      fc.property(operationSequenceArbitrary(), (operations) => {
        fc.pre(!mixesColorAndAccessoryIds(operations));
        const adapter = createSpyAdapter();
        let store = createProgressStore(adapter);
        let model = emptyModel;
        let grants = 0;
        for (const operation of operations) {
          const writesBefore = adapter.setItemCalls();
          const expectedWrites = changesData(model, operation) ? 1 : 0;
          if (operation.kind === 'reload') store = createProgressStore(adapter);
          else if (operation.kind === 'grant' && !model.welcomeGiftGranted) grants += 1;
          applyOperation(store, operation);
          model = stepModel(model, operation);
          expect(adapter.setItemCalls() - writesBefore).toBe(expectedWrites);

          const snapshot = store.snapshot();
          expect(snapshot.checkpoint).toEqual(model.checkpoint);
          expect(snapshot.history).toEqual([...model.recorded].reverse());
          expect(snapshot.candyBalance).toBe(model.candyBalance);
          expect(snapshot.candyBalance).toBe(
            (model.welcomeGiftGranted ? welcomeGiftCandy : 0) +
              snapshot.totalCandyEarned -
              modelTotalCandySpent(model),
          );
          expect(new Set(snapshot.history.map((entry) => entry.id)).size).toBe(
            snapshot.history.length,
          );
          expect(createProgressStore(adapter).snapshot()).toEqual(snapshot);
        }
        expect(grants).toBeLessThanOrEqual(1);
      }),
      { numRuns: 200 },
    );
  });

  it('a version 1 store writes nothing on load and writes version 3 on the first change', () => {
    fc.assert(
      fc.property(v1DataArbitrary, (data) => {
        const text = JSON.stringify(data);
        const adapter = createSpyAdapter({ [storageKey]: text });
        const store = createProgressStore(adapter);
        expect(adapter.setItemCalls()).toBe(0);
        expect(adapter.backing.getItem(storageKey)).toBe(text);
        expect(store.snapshot().checkpoint).toBeNull();
        store.saveCheckpoint(sampleCheckpoint);
        expect(adapter.setItemCalls()).toBe(1);
        const stored = JSON.parse(adapter.backing.getItem(storageKey) ?? '{}') as {
          schemaVersion: number;
          candy: number;
        };
        expect(stored.schemaVersion).toBe(3);
        expect(stored.candy).toBe(data.candy);
      }),
      { numRuns: 20 },
    );
  });

  it('a version 2 store writes nothing on load and writes version 3 on the first change', () => {
    fc.assert(
      fc.property(v2DataArbitrary, (data) => {
        const text = JSON.stringify(data);
        const adapter = createSpyAdapter({ [storageKey]: text });
        const store = createProgressStore(adapter);
        expect(adapter.setItemCalls()).toBe(0);
        expect(adapter.backing.getItem(storageKey)).toBe(text);
        expect(store.snapshot().unlocks).toEqual([]);
        expect(store.snapshot().coach).toEqual(defaultCoachData);
        expect(store.setCoachName('Bonny')).toEqual({ saved: true, name: 'Bonny' });
        expect(adapter.setItemCalls()).toBe(1);
        const stored = JSON.parse(adapter.backing.getItem(storageKey) ?? '{}') as {
          schemaVersion: number;
          candy: number;
          unlocks: unknown[];
          coach: { name: string | null };
        };
        expect(stored.schemaVersion).toBe(3);
        expect(stored.candy).toBe(data.candy);
        expect(stored.unlocks).toEqual([]);
        expect(stored.coach.name).toBe('Bonny');
      }),
      { numRuns: 20 },
    );
  });

  it('recording a Workout leaves the Unlocks and the Coach alone', () => {
    const store = createProgressStore(createMemoryStorage());
    store.grantWelcomeGift();
    expect(store.unlock({ id: 'witch-hat', kind: 'accessory', price: 15 }).unlocked).toBe(true);
    store.setCoachName('Bonny');
    const before = store.snapshot();
    store.recordWorkout(record('graveyard-shift', 1000, 14));
    store.finishWorkout(record('graveyard-shift', 2000, 3));
    const after = store.snapshot();
    expect(after.unlocks).toEqual(before.unlocks);
    expect(after.coach).toEqual(before.coach);
    expect(after.totalCandySpent).toBe(15);
    expect(after.candyBalance).toBe(before.candyBalance + 17);
  });

  it('an equip makes one write and a repeated equip none', () => {
    const adapter = createSpyAdapter();
    const store = createProgressStore(adapter);
    store.grantWelcomeGift();
    store.unlock({ id: 'witch-hat', kind: 'accessory', price: 15 });
    store.setAccessoryEquipped('witch-hat', false);
    const writes = adapter.setItemCalls();
    expect(store.setAccessoryEquipped('witch-hat', true)).toEqual({ changed: true });
    expect(adapter.setItemCalls()).toBe(writes + 1);
    const snapshot = store.snapshot();
    expect(store.setAccessoryEquipped('witch-hat', true)).toEqual({
      changed: false,
      reason: 'unchanged',
    });
    expect(adapter.setItemCalls()).toBe(writes + 1);
    expect(store.snapshot()).toBe(snapshot);
  });

  it('saveCheckpoint leaves Candy and history alone', () => {
    const store = createProgressStore(createMemoryStorage());
    store.grantWelcomeGift();
    store.recordWorkout(record('graveyard-shift', 1000, 14));
    const before = store.snapshot();
    expect(store.saveCheckpoint(sampleCheckpoint)).toEqual({ saved: true });
    const after = store.snapshot();
    expect(after.candyBalance).toBe(before.candyBalance);
    expect(after.history).toEqual(before.history);
    expect(after.welcomeGiftGranted).toBe(true);
    expect(after.checkpoint).toEqual(sampleCheckpoint);
  });

  it('recordWorkout leaves the checkpoint alone', () => {
    const store = createProgressStore(createMemoryStorage());
    store.saveCheckpoint(sampleCheckpoint);
    store.recordWorkout(record('graveyard-shift', 1000, 3));
    expect(store.snapshot().checkpoint).toEqual(sampleCheckpoint);
  });

  it('the checkpoint survives a new store over the same storage', () => {
    const adapter = createMemoryStorage();
    createProgressStore(adapter).saveCheckpoint(sampleCheckpoint);
    expect(createProgressStore(adapter).snapshot().checkpoint).toEqual(sampleCheckpoint);
  });

  it("a snapshot's checkpoint is a copy", () => {
    const adapter = createSpyAdapter();
    const store = createProgressStore(adapter);
    store.saveCheckpoint(sampleCheckpoint);
    const stored = adapter.backing.getItem(storageKey);
    const copy = store.snapshot().checkpoint as unknown as { version: number };
    copy.version = 99;
    expect(adapter.backing.getItem(storageKey)).toBe(stored);
    expect(createProgressStore(adapter).snapshot().checkpoint).toEqual(sampleCheckpoint);
    // The stored data is also unchanged after the next write.
    store.grantWelcomeGift();
    expect(createProgressStore(adapter).snapshot().checkpoint).toEqual(sampleCheckpoint);
  });

  it('listeners hear each checkpoint change once and a no-op not at all', () => {
    const store = createProgressStore(createMemoryStorage());
    let heard = 0;
    const unsubscribe = store.subscribe(() => {
      heard += 1;
    });
    store.clearCheckpoint();
    expect(heard).toBe(0);
    store.saveCheckpoint(sampleCheckpoint);
    expect(heard).toBe(1);
    store.clearCheckpoint();
    expect(heard).toBe(2);
    store.clearCheckpoint();
    expect(heard).toBe(2);
    store.finishWorkout(record('graveyard-shift', 1000, 3));
    expect(heard).toBe(3);
    store.finishWorkout(record('graveyard-shift', 1000, 3));
    expect(heard).toBe(3);
    unsubscribe();
    store.saveCheckpoint(sampleCheckpoint);
    expect(heard).toBe(3);
  });

  it('the stored text of an empty version 2 store carries the checkpoint member', () => {
    expect(storedTextOf(progressDataOf())).toContain('"checkpoint":null');
  });
});
