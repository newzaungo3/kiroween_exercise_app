import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import {
  createMemoryStorage,
  createProgressStore,
  storageKey,
  welcomeGiftCandy,
} from '@/progress-store';
import type { ProgressSnapshot, ProgressStore } from '@/progress-store';
import {
  checkpointArbitrary,
  createSpyAdapter,
  emptyModel,
  modelAfter,
  modelTotalCandyEarned,
  operationArbitrary,
  stepModel,
} from './support/progress';
import type { FailureMode, Model, Operation } from './support/progress';

/** Grant and record operations only: a reload would drop data that lives in memory alone. */
const changeArbitrary: fc.Arbitrary<Operation> = operationArbitrary.filter(
  (operation) => operation.kind !== 'reload',
);

const changeSequenceArbitrary = fc.array(changeArbitrary, { maxLength: 20 });

/** The model steps return a new object even for a no-op such as clearing an empty checkpoint, so compare by value. */
function modelChanged(before: Model, after: Model): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

function apply(store: ProgressStore, operation: Operation): unknown {
  if (operation.kind === 'grant') return store.grantWelcomeGift();
  if (operation.kind === 'record') return store.recordWorkout(operation.record);
  if (operation.kind === 'saveCheckpoint') return store.saveCheckpoint(operation.checkpoint);
  if (operation.kind === 'clearCheckpoint') return store.clearCheckpoint();
  if (operation.kind === 'finish') return store.finishWorkout(operation.record);
  return undefined;
}

/** The snapshot agrees with the model: gift, balance, total, newest-first history, unique ids. */
function expectSnapshotMatches(snapshot: ProgressSnapshot, model: Model): void {
  expect(snapshot.welcomeGiftGranted).toBe(model.welcomeGiftGranted);
  expect(snapshot.candyBalance).toBe(model.candyBalance);
  expect(snapshot.history).toEqual([...model.recorded].reverse());
  expect(snapshot.totalCandyEarned).toBe(modelTotalCandyEarned(model));
  expect(snapshot.checkpoint).toEqual(model.checkpoint);
  expect(new Set(snapshot.history.map((record) => record.id)).size).toBe(snapshot.history.length);
}

describe('memory-only modes', () => {
  // Feature: candy-and-history, Property 8: Memory-only modes keep the rules and write nothing they must not
  it('keeps the Candy rules and writes nothing it must not in memory-only modes', () => {
    const scenario = fc.record({
      mode: fc.constantFrom<'newer' | FailureMode>('newer', 'read', 'write', 'both'),
      version: fc.integer({ min: 3, max: 1_000_000 }),
      extra: fc.string({ maxLength: 12 }),
      operations: changeSequenceArbitrary,
    });
    fc.assert(
      fc.property(scenario, ({ mode, version, extra, operations }) => {
        const newerText = JSON.stringify({ schemaVersion: version, future: extra });
        const adapter =
          mode === 'newer'
            ? createSpyAdapter({ [storageKey]: newerText })
            : createSpyAdapter({}, mode);
        const reference = createProgressStore(createMemoryStorage());
        const store = createProgressStore(adapter);

        let model = emptyModel;
        for (const operation of operations) {
          expect(apply(store, operation)).toEqual(apply(reference, operation));
          model = stepModel(model, operation);
          expectSnapshotMatches(store.snapshot(), model);
          if (mode === 'newer') {
            expect(store.snapshot().persistent).toBe(false);
            expect(adapter.backing.dump()[storageKey]).toBe(newerText);
            expect(adapter.setItemCalls()).toBe(0);
          }
        }
        expect(model).toEqual(modelAfter(operations));
        // A read throws at creation; a write throws at the first change.
        if (mode === 'read' || mode === 'both') expect(store.snapshot().persistent).toBe(false);
        if (mode === 'write' && modelChanged(emptyModel, model)) {
          expect(store.snapshot().persistent).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  // Feature: resume-after-refresh, Property 12: Memory-only modes keep working
  it('keeps the model, checkpoint and Persistent_Flag in memory-only modes', () => {
    const scenario = fc.record({
      mode: fc.constantFrom<'newer' | 'write' | 'both'>('newer', 'write', 'both'),
      version: fc.integer({ min: 3, max: 1_000_000 }),
      operations: changeSequenceArbitrary,
    });
    fc.assert(
      fc.property(scenario, ({ mode, version, operations }) => {
        const newerText = JSON.stringify({ schemaVersion: version, future: 'x' });
        const adapter =
          mode === 'newer'
            ? createSpyAdapter({ [storageKey]: newerText })
            : createSpyAdapter({}, mode);
        const store = createProgressStore(adapter);
        let model = emptyModel;
        for (const operation of operations) {
          apply(store, operation);
          model = stepModel(model, operation);
          expectSnapshotMatches(store.snapshot(), model);
          // A write that throws is attempted only for a change.
          if (mode === 'newer' || modelChanged(emptyModel, model)) {
            expect(store.snapshot().persistent).toBe(false);
          }
          if (mode === 'newer') expect(adapter.backing.dump()[storageKey]).toBe(newerText);
        }
        if (mode === 'newer') {
          expect(adapter.setItemCalls()).toBe(0);
          expect(adapter.backing.dump()[storageKey]).toBe(newerText);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('a checkpoint saved over a throwing adapter stays in memory', () => {
    const checkpoint = fc.sample(checkpointArbitrary, 1)[0]!;
    const store = createProgressStore(createSpyAdapter({}, 'write'));
    expect(store.saveCheckpoint(checkpoint)).toEqual({ saved: true });
    expect(store.snapshot().checkpoint).toEqual(checkpoint);
    expect(store.snapshot().persistent).toBe(false);
  });

  it('a checkpoint is never written over newer data', () => {
    const text = JSON.stringify({ schemaVersion: 3, candy: 99 });
    const adapter = createSpyAdapter({ [storageKey]: text });
    const store = createProgressStore(adapter);
    const checkpoint = fc.sample(checkpointArbitrary, 1)[0]!;
    store.saveCheckpoint(checkpoint);
    expect(store.snapshot().checkpoint).toEqual(checkpoint);
    store.clearCheckpoint();
    expect(adapter.backing.dump()[storageKey]).toBe(text);
    expect(adapter.setItemCalls()).toBe(0);
    expect(store.snapshot().persistent).toBe(false);
  });

  it('an adapter that throws on write keeps the Candy in memory and reports not persistent', () => {
    const adapter = createSpyAdapter({}, 'write');
    const store = createProgressStore(adapter);
    expect(store.grantWelcomeGift()).toBe(true);
    const snapshot = store.snapshot();
    expect(snapshot.candyBalance).toBe(welcomeGiftCandy);
    expect(snapshot.persistent).toBe(false);
  });

  it('an adapter that throws on read starts empty and reports not persistent', () => {
    const store = createProgressStore(createSpyAdapter({}, 'read'));
    const snapshot = store.snapshot();
    expect(snapshot.candyBalance).toBe(0);
    expect(snapshot.history).toEqual([]);
    expect(snapshot.persistent).toBe(false);
  });

  it('data from a newer schema version is never overwritten', () => {
    const text = JSON.stringify({ schemaVersion: 3, candy: 99, unlocks: ['witch-hat'] });
    const adapter = createSpyAdapter({ [storageKey]: text });
    const store = createProgressStore(adapter);
    store.grantWelcomeGift();
    store.recordWorkout({
      id: 'graveyard-shift:1',
      routineId: 'graveyard-shift',
      finishedAt: 1,
      outcome: 'completed',
      candyEarned: 14,
    });
    expect(adapter.backing.dump()[storageKey]).toBe(text);
    expect(adapter.setItemCalls()).toBe(0);
    expect(store.snapshot().persistent).toBe(false);
  });

  it('a snapshot that the caller changes does not change the store', () => {
    const adapter = createSpyAdapter();
    const store = createProgressStore(adapter);
    store.grantWelcomeGift();
    const storedBefore = adapter.backing.dump()[storageKey];
    const snapshot = store.snapshot() as unknown as { candyBalance: number; history: unknown[] };
    try {
      snapshot.candyBalance = 9999;
      snapshot.history.push({ id: 'x' });
    } catch {
      // A frozen snapshot rejects the change, which is also fine.
    }
    expect(adapter.backing.dump()[storageKey]).toBe(storedBefore);
    const fresh = createProgressStore(adapter).snapshot();
    expect(fresh.candyBalance).toBe(welcomeGiftCandy);
    expect(fresh.history).toEqual([]);
  });

  it('the store reads only through the adapter', () => {
    const forbidden = new Proxy(
      {},
      {
        get() {
          throw new Error('the store touched a browser storage global');
        },
      },
    );
    vi.stubGlobal('localStorage', forbidden);
    vi.stubGlobal('sessionStorage', forbidden);
    try {
      const adapter = createSpyAdapter();
      const store = createProgressStore(adapter);
      expect(store.grantWelcomeGift()).toBe(true);
      expect(adapter.getItemCalls()).toBeGreaterThan(0);
      expect(adapter.setItemCalls()).toBe(1);
      expect(adapter.backing.dump()[storageKey]).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('interleaved stores', () => {
  // Feature: candy-and-history, Property 9: Two stores over one storage lose no update
  it('two stores over one storage lose no update', () => {
    const step = fc.record({
      store: fc.constantFrom(0, 1),
      operation: changeArbitrary,
    });
    fc.assert(
      fc.property(fc.array(step, { maxLength: 20 }), (steps) => {
        const adapter = createMemoryStorage();
        const stores = [createProgressStore(adapter), createProgressStore(adapter)];
        for (const { store, operation } of steps) apply(stores[store]!, operation);

        const model = modelAfter(steps.map((entry) => entry.operation));
        const third = createProgressStore(adapter).snapshot();
        expectSnapshotMatches(third, model);
        expect(third.persistent).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

describe('listeners', () => {
  // Feature: candy-and-history, Property 10: Listeners hear each change once
  it('listeners hear each change once', () => {
    fc.assert(
      fc.property(changeSequenceArbitrary, (operations) => {
        const store = createProgressStore(createMemoryStorage());
        let calls = 0;
        store.subscribe(() => {
          calls += 1;
        });

        let model = emptyModel;
        for (const operation of operations) {
          const before = store.snapshot();
          expect(store.snapshot()).toBe(before);
          const callsBefore = calls;
          apply(store, operation);
          const next = stepModel(model, operation);
          const changed = modelChanged(model, next);
          model = next;

          expect(calls - callsBefore).toBe(changed ? 1 : 0);
          if (changed) expect(store.snapshot()).not.toBe(before);
          else expect(store.snapshot()).toBe(before);
          expect(store.snapshot()).toBe(store.snapshot());
        }
      }),
      { numRuns: 200 },
    );
  });

  it('a listener that unsubscribed hears nothing', () => {
    const store = createProgressStore(createMemoryStorage());
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    unsubscribe();
    store.grantWelcomeGift();
    expect(calls).toBe(0);
  });
});
