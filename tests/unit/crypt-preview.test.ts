import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cryptContent, type CryptOption } from '@/catalog';
import { isOwned, resolveLook, type StoredChoices } from '@/ui/crypt/look';
import { optionStates } from '@/ui/crypt/offers';
import {
  emptyPreview,
  previewReducer,
  prunePreview,
  shownLook,
  type Preview,
  type PreviewAction,
} from '@/ui/crypt/preview';

const options: readonly CryptOption[] = [...cryptContent.coachColors, ...cryptContent.accessories];
const colorIds = cryptContent.coachColors.map((entry) => entry.id);
const accessoryIds = cryptContent.accessories.map((entry) => entry.id);

const storedArbitrary: fc.Arbitrary<StoredChoices> = fc.record({
  coach: fc.record({
    color: fc.option(fc.constantFrom(...colorIds, 'unknown'), { nil: null }),
    accessories: fc.subarray([...accessoryIds, 'unknown']),
  }),
  unlocks: fc.subarray(options.map((option) => ({ id: option.id, kind: option.kind }))),
});

const actionArbitrary: fc.Arbitrary<PreviewAction> = fc.oneof(
  fc.record({ type: fc.constant('toggleColor' as const), id: fc.constantFrom(...colorIds) }),
  fc.record({ type: fc.constant('toggleAccessory' as const), id: fc.constantFrom(...accessoryIds) }),
  fc.record({
    type: fc.constant('drop' as const),
    id: fc.constantFrom(...options.map((option) => option.id)),
  }),
  fc.constant({ type: 'clear' as const }),
);

const actionsArbitrary = fc.array(actionArbitrary, { maxLength: 15 });

function run(actions: readonly PreviewAction[]): Preview {
  return actions.reduce<Preview>((preview, action) => previewReducer(preview, action), emptyPreview);
}

const isLocked = (id: string, kind: string): boolean => {
  const option = options.find((entry) => entry.id === id && entry.kind === kind);
  return option !== undefined && option.price > 0;
};

describe('Crypt Preview', () => {
  // Feature: the-crypt, Property 12: A Preview never changes the Equipped_Look
  // **Validates: Requirements 12.2, 12.3, 12.4, 12.8**
  it('a Preview never changes the Equipped_Look', () => {
    fc.assert(
      fc.property(storedArbitrary, actionsArbitrary, (stored, actions) => {
        const look = resolveLook(stored);
        const storedBefore = JSON.stringify(stored);
        const lookBefore = JSON.stringify(look);
        const preview = run(actions);

        expect(shownLook(look, emptyPreview)).toEqual(look);

        // Reducer actions touch neither the stored choices nor the look.
        expect(JSON.stringify(stored)).toBe(storedBefore);
        expect(JSON.stringify(look)).toBe(lookBefore);

        // The Preview holds only Locked options (before any Unlock) and one color.
        expect(preview.color === null || isLocked(preview.color, 'color')).toBe(true);
        for (const id of preview.accessories) expect(isLocked(id, 'accessory')).toBe(true);

        const shown = shownLook(look, preview);
        expect(typeof shown.color).toBe('string');
        expect(shown.color).toBe(preview.color ?? look.color);

        // Differs from the Equipped_Look only by Preview options.
        const added = shown.accessories.filter((id) => !look.accessories.includes(id));
        for (const id of added) expect(preview.accessories).toContain(id);
        for (const id of look.accessories) expect(shown.accessories).toContain(id);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: the-crypt, Property 12: A Preview never changes the Equipped_Look
  // **Validates: Requirements 12.2, 12.3**
  it('toggling an option twice returns the Preview to where it was', () => {
    fc.assert(
      fc.property(
        actionsArbitrary,
        fc.constantFrom(...cryptContent.accessories.filter((entry) => entry.price > 0).map((e) => e.id)),
        (actions, id) => {
          const base = run(actions);
          const toggle: PreviewAction = { type: 'toggleAccessory', id };
          const twice = previewReducer(previewReducer(base, toggle), toggle);
          expect(twice).toEqual(base);
        },
      ),
      { numRuns: 200 },
    );
    const lockedColor = cryptContent.coachColors.find((entry) => entry.price > 0)!;
    const once = previewReducer(emptyPreview, { type: 'toggleColor', id: lockedColor.id });
    expect(previewReducer(once, { type: 'toggleColor', id: lockedColor.id })).toEqual(emptyPreview);
  });

  // Feature: the-crypt, Property 12: A Preview never changes the Equipped_Look
  // **Validates: Requirements 12.4, 12.8**
  it('prunePreview removes every option that became Owned and keeps the rest', () => {
    fc.assert(
      fc.property(actionsArbitrary, storedArbitrary, (actions, stored) => {
        const preview = prunePreview(run(actions), stored);
        if (preview.color !== null) {
          const entry = cryptContent.coachColors.find((c) => c.id === preview.color)!;
          expect(isOwned(entry, stored.unlocks)).toBe(false);
        }
        for (const id of preview.accessories) {
          const entry = cryptContent.accessories.find((a) => a.id === id)!;
          expect(isOwned(entry, stored.unlocks)).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('toggling an Owned or unknown option changes nothing', () => {
    const freeColor = cryptContent.coachColors.find((entry) => entry.price === 0)!;
    expect(previewReducer(emptyPreview, { type: 'toggleColor', id: freeColor.id })).toBe(emptyPreview);
    expect(
      previewReducer(emptyPreview, {
        type: 'toggleAccessory',
        // Deliberately outside the typed ids.
        id: 'no-such-accessory' as (typeof accessoryIds)[number],
      }),
    ).toBe(emptyPreview);
  });

  it('a second color Preview replaces the first', () => {
    const [first, second] = cryptContent.coachColors.filter((entry) => entry.price > 0);
    const preview = run([
      { type: 'toggleColor', id: first!.id },
      { type: 'toggleColor', id: second!.id },
    ]);
    expect(preview.color).toBe(second!.id);
  });

  it('prunePreview drops options that became Owned', () => {
    const preview = run([
      { type: 'toggleAccessory', id: 'witch-hat' },
      { type: 'toggleColor', id: 'ember' },
    ]);
    const stored: StoredChoices = {
      coach: { color: null, accessories: [] },
      unlocks: [{ id: 'witch-hat', kind: 'accessory' }],
    };
    expect(prunePreview(preview, stored)).toEqual({ color: 'ember', accessories: [] });
  });
});

describe('Crypt Unlock buttons', () => {
  const noStored = (unlocks: StoredChoices['unlocks'] = []): StoredChoices => ({
    coach: { color: null, accessories: [] },
    unlocks,
  });

  // Feature: the-crypt, Property 13: The Unlock button tells the truth about Candy
  // **Validates: Requirements 13.2, 13.3, 13.7**
  it('the Unlock button is enabled exactly when the balance covers the Price', () => {
    fc.assert(
      fc.property(
        storedArbitrary,
        fc.integer({ min: 0, max: 200 }),
        actionsArbitrary,
        (stored, balance, actions) => {
          const states = optionStates(stored, balance, run(actions));
          const all = [...states.colors, ...states.accessories];
          expect(all).toHaveLength(options.length);
          for (const state of all) {
            const owned = isOwned(state.option, stored.unlocks);
            if (owned) {
              expect(state.unlock).toBeNull();
              continue;
            }
            const button = state.unlock;
            expect(button).not.toBeNull();
            expect(button!.price).toBe(state.option.price);
            expect(button!.enabled).toBe(balance >= state.option.price);
            if (!button!.enabled) {
              expect(button!.shortBy).toBe(Math.max(0, state.option.price - balance));
              expect(button!.shortBy).toBeGreaterThanOrEqual(1);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('with 15 Candy the witch hat is enabled and the pumpkin head is 25 short', () => {
    const { accessories } = optionStates(noStored(), 15, emptyPreview);
    const hat = accessories.find((s) => s.option.id === 'witch-hat')!;
    const pumpkin = accessories.find((s) => s.option.id === 'pumpkin-head')!;
    expect(hat.unlock).toEqual({ enabled: true, price: 15 });
    expect(pumpkin.unlock).toEqual({ enabled: false, price: 40, shortBy: 25 });
  });

  it('with 0 Candy each Locked color is 5 short', () => {
    const { colors } = optionStates(noStored(), 0, emptyPreview);
    const locked = colors.filter((s) => s.option.price > 0);
    expect(locked.length).toBeGreaterThan(0);
    for (const state of locked) {
      expect(state.unlock).toEqual({ enabled: false, price: 5, shortBy: 5 });
    }
  });
});
