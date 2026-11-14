import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createMemoryStorage,
  createProgressStore,
  storageKey,
  welcomeGiftCandy,
} from '@/progress-store';
import type { WorkoutRecord } from '@/progress-store';
import {
  createSpyAdapter,
  modelAfter,
  modelTotalCandyEarned,
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
        expect(snapshot.candyBalance - snapshot.totalCandyEarned).toBe(
          grants === 1 ? welcomeGiftCandy : 0,
        );
      }),
      { numRuns: 200 },
    );
  });

  // Feature: candy-and-history, Property 4: Balance, total and order agree
  // **Validates: Requirements 3.4, 5.1, 5.2, 5.3, 5.4**
  it('the balance, the total and the order agree after every step', () => {
    fc.assert(
      fc.property(operationSequenceArbitrary(), (operations) => {
        const run = runOperations(createMemoryStorage(), operations);
        run.steps.forEach((step, index) => {
          const model = modelAfter(operations.slice(0, index + 1));
          const { snapshot } = step;
          expect(snapshot.history).toEqual([...model.recorded].reverse());
          expect(snapshot.totalCandyEarned).toBe(modelTotalCandyEarned(model));
          expect(snapshot.candyBalance).toBe(
            (model.welcomeGiftGranted ? welcomeGiftCandy : 0) + snapshot.totalCandyEarned,
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
