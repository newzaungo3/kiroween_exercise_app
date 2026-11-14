import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createMemoryStorage, createProgressStore, storageKey } from '@/progress-store';
import {
  createSpyAdapter,
  modelAfter,
  modelTotalCandySpent,
  operationSequenceArbitrary,
  runOperations,
  stepModel,
  unlockRequestArbitrary,
} from './support/progress';

const witchHat = { id: 'witch-hat', kind: 'accessory', price: 15 } as const;
const pumpkinHead = { id: 'pumpkin-head', kind: 'accessory', price: 40 } as const;
const emberColor = { id: 'ember', kind: 'color', price: 5 } as const;

function storeWithCandy(adapter = createMemoryStorage()) {
  const store = createProgressStore(adapter);
  store.grantWelcomeGift();
  return { adapter, store };
}

describe('Progress store: Unlocks', () => {
  // Feature: the-crypt, Property 4: An Unlock spends exactly its Price or nothing
  // **Validates: Requirements 3.2, 3.4, 3.5**
  it('an Unlock spends exactly its Price or nothing', () => {
    fc.assert(
      fc.property(
        operationSequenceArbitrary({ maxLength: 12 }),
        unlockRequestArbitrary,
        (prefix, request) => {
          const adapter = createSpyAdapter();
          const run = runOperations(adapter, prefix);
          const model = modelAfter(prefix);
          const expected = stepModel(model, { kind: 'unlock', request });
          const before = run.store.snapshot();
          const setsBefore = adapter.setItemCalls();

          const result = run.store.unlock(request);
          const after = run.store.snapshot();
          const sets = adapter.setItemCalls() - setsBefore;

          if (expected !== model) {
            expect(result).toEqual({ unlocked: true, candyBalance: model.candyBalance - request.price });
            expect(after.candyBalance).toBe(model.candyBalance - request.price);
            expect(after.unlocks).toEqual(expected.unlocks);
            expect(after.unlocks).toHaveLength(before.unlocks.length + 1);
            expect(after.unlocks[after.unlocks.length - 1]).toEqual({
              id: request.id,
              kind: request.kind,
              candySpent: request.price,
            });
            expect(after.totalCandySpent).toBe(modelTotalCandySpent(expected));
            expect(after.coach).toEqual(expected.coach);
            expect(sets).toBe(1);
          } else {
            expect(result.unlocked).toBe(false);
            expect(after).toEqual(before);
            expect(sets).toBe(0);
            if (!result.unlocked) {
              const recorded = before.unlocks.some((entry) => entry.id === request.id);
              if (result.reason === 'insufficient') {
                expect(recorded).toBe(false);
                expect(request.price).toBeGreaterThan(before.candyBalance);
              } else if (result.reason === 'already') {
                expect(recorded).toBe(true);
              } else {
                expect(result.reason).toBe('invalid');
              }
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // Feature: the-crypt, Property 5: An Unlock with too little Candy changes nothing
  // **Validates: Requirements 3.4, 3.5, 4.1**
  it('an Unlock with too little Candy changes nothing', () => {
    fc.assert(
      fc.property(
        operationSequenceArbitrary({ maxLength: 12 }),
        unlockRequestArbitrary,
        (prefix, request) => {
          const adapter = createSpyAdapter();
          const run = runOperations(adapter, prefix);
          const before = run.store.snapshot();
          const owned = before.unlocks.some((entry) => entry.id === request.id);
          fc.pre(!owned && request.price > before.candyBalance);
          fc.pre(Number.isSafeInteger(request.price) && request.price >= 1 && request.price <= 999);
          fc.pre(request.kind === 'color' || request.kind === 'accessory');
          fc.pre(/^[a-z][a-z0-9-]{0,39}$/.test(request.id));
          const textBefore = adapter.backing.getItem(storageKey);
          const setsBefore = adapter.setItemCalls();

          const result = run.store.unlock(request);

          expect(result).toEqual({
            unlocked: false,
            reason: 'insufficient',
            shortBy: request.price - before.candyBalance,
          });
          const after = run.store.snapshot();
          expect(after).toEqual(before);
          expect(after).toBe(before);
          expect(adapter.backing.getItem(storageKey)).toBe(textBefore);
          expect(adapter.setItemCalls()).toBe(setsBefore);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('an Unlock with too little Candy is rejected and the Candy balance is unchanged', () => {
    const { store } = storeWithCandy();
    const before = store.snapshot();
    expect(store.unlock(pumpkinHead)).toEqual({ unlocked: false, reason: 'insufficient', shortBy: 25 });
    expect(store.snapshot().candyBalance).toBe(15);
    expect(store.snapshot()).toEqual(before);
    expect(store.snapshot().unlocks).toEqual([]);
  });

  it('Unlocks persist across a new store over the same storage', () => {
    const { adapter, store } = storeWithCandy();
    expect(store.unlock(witchHat)).toEqual({ unlocked: true, candyBalance: 0 });
    const reloaded = createProgressStore(adapter).snapshot();
    expect(reloaded.candyBalance).toBe(0);
    expect(reloaded.unlocks).toEqual([{ id: 'witch-hat', kind: 'accessory', candySpent: 15 }]);
  });

  it('equip and unequip persist across a reload', () => {
    const { adapter, store } = storeWithCandy();
    store.unlock(witchHat);
    expect(store.setAccessoryEquipped('witch-hat', false)).toEqual({ changed: true });
    expect(createProgressStore(adapter).snapshot().coach.accessories).toEqual([]);
    expect(store.setAccessoryEquipped('witch-hat', true)).toEqual({ changed: true });
    expect(createProgressStore(adapter).snapshot().coach.accessories).toEqual(['witch-hat']);
    expect(store.equipColor(null)).toEqual({ changed: false, reason: 'unchanged' });
  });

  it('an Unlock also equips', () => {
    const { store } = storeWithCandy();
    store.unlock(witchHat);
    expect(store.snapshot().coach.accessories).toEqual(['witch-hat']);
    const second = createProgressStore(createMemoryStorage());
    second.grantWelcomeGift();
    second.unlock(emberColor);
    expect(second.snapshot().coach.color).toBe('ember');
  });

  it('an Unlock twice spends once', () => {
    const { adapter, store } = storeWithCandy();
    expect(store.unlock(emberColor).unlocked).toBe(true);
    const sets = adapter.getItem(storageKey);
    expect(store.unlock(emberColor)).toEqual({ unlocked: false, reason: 'already' });
    expect(store.snapshot().candyBalance).toBe(10);
    expect(store.snapshot().unlocks).toHaveLength(1);
    expect(adapter.getItem(storageKey)).toBe(sets);
  });

  it('a locked Accessory cannot be equipped', () => {
    const { adapter, store } = storeWithCandy();
    const before = store.snapshot();
    expect(store.setAccessoryEquipped('witch-hat', true)).toEqual({ changed: false, reason: 'locked' });
    expect(store.snapshot()).toEqual(before);
    expect(createProgressStore(adapter).snapshot().coach.accessories).toEqual([]);
  });

  it('two stores over one storage never spend the same Candy twice', () => {
    const adapter = createMemoryStorage();
    const first = createProgressStore(adapter);
    first.grantWelcomeGift();
    const second = createProgressStore(adapter);
    expect(second.snapshot().candyBalance).toBe(15);

    expect(first.unlock(witchHat)).toEqual({ unlocked: true, candyBalance: 0 });
    expect(second.unlock(witchHat).unlocked).toBe(false);

    const final = createProgressStore(adapter).snapshot();
    expect(final.candyBalance).toBe(0);
    expect(final.unlocks).toHaveLength(1);
    expect(final.totalCandySpent).toBe(15);
  });

  it('a Coach name is stored as plain text', () => {
    const { adapter, store } = storeWithCandy();
    expect(store.setCoachName("Bonny O'Bone")).toEqual({ saved: true, name: "Bonny O'Bone" });
    expect(createProgressStore(adapter).snapshot().coach.name).toBe("Bonny O'Bone");
    const stored = JSON.parse(adapter.getItem(storageKey) ?? '{}') as { coach: { name: string } };
    expect(stored.coach.name).toBe("Bonny O'Bone");
    expect(adapter.getItem(storageKey)).not.toMatch(/&#|&amp;|\\'/);
  });
});
