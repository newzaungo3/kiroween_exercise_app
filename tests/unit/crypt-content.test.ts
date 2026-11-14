import { describe, expect, it } from 'vitest';
import {
  coachColorIds,
  cryptContent,
  entries,
  validateCryptContent,
  type CryptDraft,
  type CryptRule,
} from '@/catalog';
import { isOptionId, maxUnlockPrice, welcomeGiftCandy } from '@/progress-store';
import { coachColorHex, coachColorToken } from '@/ui/crypt/coach-colors';
import { colors } from '@/ui/theme/tokens';

const shipped: CryptDraft = cryptContent;

function withColor(id: string, change: object): CryptDraft {
  return {
    ...shipped,
    coachColors: cryptContent.coachColors.map((c) => (c.id === id ? { ...c, ...change } : c)),
  };
}

function withAccessory(id: string, change: object): CryptDraft {
  return {
    ...shipped,
    accessories: cryptContent.accessories.map((a) => (a.id === id ? { ...a, ...change } : a)),
  };
}

describe('the shipped Crypt_Content', () => {
  it('breaks no Crypt rule', () => {
    expect(validateCryptContent(shipped, entries)).toEqual([]);
  });

  it('ships the Coach colors and Accessories in Crypt order with their Prices', () => {
    expect(cryptContent.coachColors.map((c) => [c.id, c.price])).toEqual([
      ['bone', 0],
      ['ash', 0],
      ['moonlight', 0],
      ['ember', 5],
      ['slime', 5],
      ['witch', 5],
    ]);
    expect(cryptContent.coachColors.map((c) => c.id)).toEqual([...coachColorIds]);
    expect(cryptContent.accessories.map((a) => [a.id, a.price])).toEqual([
      ['glowing-eyes', 10],
      ['witch-hat', 15],
      ['pumpkin-head', 40],
    ]);
  });

  it('the Welcome gift covers the witch hat', () => {
    const hat = cryptContent.accessories.find((a) => a.id === 'witch-hat');
    expect(hat).toBeDefined();
    expect(welcomeGiftCandy).toBeGreaterThanOrEqual(hat?.price ?? Infinity);
  });

  it('gives every Coach color a hex token and Bone White the asset bone colour', () => {
    for (const id of coachColorIds) {
      expect(colors[coachColorToken[id]]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(coachColorHex(id)).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(colors.coachBone).toBe('#f5f0e3');
  });

  it('uses valid Option_Ids and Prices within the Unlock limits', () => {
    for (const option of [...cryptContent.coachColors, ...cryptContent.accessories]) {
      expect(isOptionId(option.id)).toBe(true);
      if (option.kind === 'color' && option.price === 0) continue;
      expect(option.price).toBeGreaterThanOrEqual(1);
      expect(option.price).toBeLessThanOrEqual(maxUnlockPrice);
    }
  });
});

describe('Crypt_Content validation', () => {
  const broken: readonly (readonly [CryptRule, CryptDraft])[] = [
    [
      'free-color-count',
      {
        ...shipped,
        coachColors: cryptContent.coachColors.map((c) =>
          c.id === 'ash' || c.id === 'moonlight' ? { ...c, price: 5 } : c,
        ),
      },
    ],
    ['default-color-count', withColor('bone', { isDefault: false })],
    ['default-color-price', withColor('bone', { price: 5 })],
    ['option-id-format', withColor('ash', { id: 'Ash' })],
    ['option-id-duplicate', withColor('ember', { id: 'ash' })],
    ['color-price', withColor('ember', { price: maxUnlockPrice + 1 })],
    ['accessory-price', withAccessory('glowing-eyes', { price: 0 })],
    ['node-format', withAccessory('witch-hat', { node: 'hat' })],
    ['node-duplicate', withAccessory('pumpkin-head', { node: 'accessory_glowing_eyes' })],
    ['combination-unknown', withAccessory('glowing-eyes', { hiddenBy: 'ghost' })],
    ['combination-self', withAccessory('glowing-eyes', { hiddenBy: 'glowing-eyes' })],
    ['accessory-asset-path', { ...shipped, accessoryAsset: '' }],
    ['preview-exercise-unknown', { ...shipped, previewExerciseId: 'no-such-exercise' }],
  ];

  it.each(broken)('reports exactly the %s rule for its broken draft', (rule, draft) => {
    expect(validateCryptContent(draft, entries).map((v) => v.rule)).toEqual([rule]);
  });
});
