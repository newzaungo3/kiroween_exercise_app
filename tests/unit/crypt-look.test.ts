import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { accessoryIds, coachColorIds, cryptContent, type AccessoryId } from '@/catalog';
import { appearanceOf } from '@/ui/crypt/appearance';
import { coachColorHex } from '@/ui/crypt/coach-colors';
import { coachNameOrDefault, safetyMessage } from '@/ui/crypt/labels';
import {
  defaultLook,
  isOwned,
  nodesFor,
  resolveLook,
  type StoredChoices,
} from '@/ui/crypt/look';
import { t } from '@/ui/strings';

const runs = { numRuns: 200 };

const idArb = fc.oneof(
  fc.constantFrom<string>(...coachColorIds, ...accessoryIds),
  fc.string({ maxLength: 12 }),
);
const kindArb = fc.constantFrom<'color' | 'accessory'>('color', 'accessory');
const storedArb: fc.Arbitrary<StoredChoices> = fc.record({
  coach: fc.record({
    color: fc.option(idArb, { nil: null }),
    accessories: fc.array(idArb, { maxLength: 8 }),
  }),
  unlocks: fc.array(fc.record({ id: idArb, kind: kindArb }), { maxLength: 8 }),
});

const freeColors = cryptContent.coachColors.filter((c) => c.price === 0).map((c) => c.id);
const contentOrder = cryptContent.accessories.map((a) => a.id);

describe('the Look_Rule', () => {
  // Feature: the-crypt, Property 9: The Look_Rule shows only known, owned options
  // Validates: Requirements 7.1, 7.2, 7.5
  it('shows only known, owned options in Crypt_Content order', () => {
    fc.assert(
      fc.property(fc.option(storedArb, { nil: null }), (stored) => {
        const look = resolveLook(stored);
        const unlocks = stored?.unlocks ?? [];
        const colorEntry = cryptContent.coachColors.find((c) => c.id === look.color);
        expect(colorEntry).toBeDefined();
        if (stored === null) {
          expect(look).toEqual(defaultLook);
          return;
        }
        const ownedColor =
          freeColors.includes(look.color) ||
          unlocks.some((u) => u.id === look.color && u.kind === 'color');
        expect(ownedColor).toBe(true);
        if (stored.coach.color === null || !ownedColor) expect(look.color).toBe(defaultLook.color);
        const expected = contentOrder.filter(
          (id) =>
            stored.coach.accessories.includes(id) &&
            unlocks.some((u) => u.id === id && u.kind === 'accessory'),
        );
        expect(look.accessories).toEqual(expected);
        expect(new Set(look.accessories).size).toBe(look.accessories.length);
      }),
      runs,
    );
  });

  it('uses the default look for no stored choices', () => {
    expect(resolveLook(null)).toEqual({ color: 'bone', accessories: [] });
    expect(defaultLook).toEqual({ color: 'bone', accessories: [] });
  });

  it('shows all three Accessories when all are unlocked and equipped', () => {
    const look = resolveLook({
      coach: { color: 'ember', accessories: ['pumpkin-head', 'witch-hat', 'glowing-eyes'] },
      unlocks: [
        { id: 'ember', kind: 'color' },
        { id: 'glowing-eyes', kind: 'accessory' },
        { id: 'witch-hat', kind: 'accessory' },
        { id: 'pumpkin-head', kind: 'accessory' },
      ],
    });
    expect(look).toEqual({
      color: 'ember',
      accessories: ['glowing-eyes', 'witch-hat', 'pumpkin-head'],
    });
  });

  it('falls back to the default color for an unknown stored color', () => {
    const look = resolveLook({
      coach: { color: 'neon-pink', accessories: [] },
      unlocks: [{ id: 'neon-pink', kind: 'color' }],
    });
    expect(look.color).toBe('bone');
  });

  it('treats a free option as owned and a priced one as owned only when unlocked', () => {
    const ash = cryptContent.coachColors.find((c) => c.id === 'ash');
    const ember = cryptContent.coachColors.find((c) => c.id === 'ember');
    if (ash === undefined || ember === undefined) throw new Error('content missing');
    expect(isOwned(ash, [])).toBe(true);
    expect(isOwned(ember, [])).toBe(false);
    expect(isOwned(ember, [{ id: 'ember', kind: 'accessory' }])).toBe(false);
    expect(isOwned(ember, [{ id: 'ember', kind: 'color' }])).toBe(true);
  });
});

describe('the Node_Rule', () => {
  const accessoriesArb = fc.array(fc.constantFrom<AccessoryId>(...accessoryIds), {
    maxLength: 8,
  });

  // Feature: the-crypt, Property 10: The Node_Rule follows the asset contract
  // Validates: Requirements 7.3, 7.4, 7.6, 17.5
  it('follows the asset contract', () => {
    fc.assert(
      fc.property(accessoriesArb, (list) => {
        const nodes = nodesFor(list);
        const has = (id: AccessoryId) => list.includes(id);
        expect(new Set(nodes).size).toBe(nodes.length);
        expect(
          nodes.includes('accessory_witch_hat') &&
            nodes.includes('accessory_witch_hat_on_pumpkin'),
        ).toBe(false);
        expect(nodes.includes('accessory_witch_hat_on_pumpkin')).toBe(
          has('witch-hat') && has('pumpkin-head'),
        );
        expect(nodes.includes('accessory_witch_hat')).toBe(
          has('witch-hat') && !has('pumpkin-head'),
        );
        expect(nodes.includes('accessory_glowing_eyes')).toBe(
          has('glowing-eyes') && !has('pumpkin-head'),
        );
        expect(nodes.includes('accessory_pumpkin_head')).toBe(has('pumpkin-head'));
        const expectedCount = new Set(list).size - (has('glowing-eyes') && has('pumpkin-head') ? 1 : 0);
        expect(nodes.length).toBe(expectedCount);

        const appearance = appearanceOf({ color: 'bone', accessories: list }, { fetchAccessories: true });
        expect(appearance.shownNodes).toEqual(nodes);
        for (const node of [
          'accessory_glowing_eyes',
          'accessory_witch_hat',
          'accessory_witch_hat_on_pumpkin',
          'accessory_pumpkin_head',
        ]) {
          expect(appearance.framingNodes).toContain(node);
        }
      }),
      runs,
    );
  });

  it('builds the appearance with the color value and asset path', () => {
    const appearance = appearanceOf(
      { color: 'witch', accessories: ['witch-hat'] },
      { fetchAccessories: false },
    );
    expect(appearance.boneColor).toBe(coachColorHex('witch'));
    expect(appearance.accessoryAsset).toBe(cryptContent.accessoryAsset);
    expect(appearance.fetchAccessories).toBe(false);
    expect(appearance.shownNodes).toEqual(['accessory_witch_hat']);
  });
});

describe('the Safety_Message', () => {
  it('uses the default Coach name when there is none', () => {
    expect(coachNameOrDefault(null)).toBe(t('coach.defaultName'));
    expect(coachNameOrDefault('')).toBe(t('coach.defaultName'));
    expect(safetyMessage(null)).toMatch(new RegExp(`^${t('coach.defaultName')} here\\.`));
  });

  it('renders a name holding placeholders and replacement patterns literally', () => {
    const name = '{coach} $&';
    const message = safetyMessage(name);
    expect(message.startsWith(`${name} here.`)).toBe(true);
    expect(message).not.toContain('{coach}'.concat(' ', '{coach}'));
    expect(message.split(name).length).toBe(2);
  });
});
