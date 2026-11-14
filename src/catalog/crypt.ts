/**
 * The Crypt_Content: the Coach colors, the Accessories, their Prices, the
 * Accessory_Nodes, the Accessory_Asset path and the Crypt_Preview_Exercise,
 * plus the validation function that guards them.
 *
 * Pure: imports only Catalog files. Colour values live in the theme tokens,
 * and names are Strings_Module identifiers resolved by the UI.
 */
import {
  accessoryIds,
  coachColorIds,
  type AccessoryEntry,
  type CoachColorEntry,
  type CryptContent,
  type CryptDraft,
  type CryptRule,
  type CryptViolation,
  type ExerciseDraft,
} from './types';
import { isBadAssetPath } from './validate';

export { accessoryIds, coachColorIds };

const coachColors: readonly CoachColorEntry[] = [
  { kind: 'color', id: 'bone', nameId: 'coachColor.bone.name', price: 0, isDefault: true },
  { kind: 'color', id: 'ash', nameId: 'coachColor.ash.name', price: 0, isDefault: false },
  {
    kind: 'color',
    id: 'moonlight',
    nameId: 'coachColor.moonlight.name',
    price: 0,
    isDefault: false,
  },
  { kind: 'color', id: 'ember', nameId: 'coachColor.ember.name', price: 5, isDefault: false },
  { kind: 'color', id: 'slime', nameId: 'coachColor.slime.name', price: 5, isDefault: false },
  { kind: 'color', id: 'witch', nameId: 'coachColor.witch.name', price: 5, isDefault: false },
];

const accessories: readonly AccessoryEntry[] = [
  {
    kind: 'accessory',
    id: 'glowing-eyes',
    nameId: 'accessory.glowingEyes.name',
    price: 10,
    node: 'accessory_glowing_eyes',
    hiddenBy: 'pumpkin-head',
  },
  {
    kind: 'accessory',
    id: 'witch-hat',
    nameId: 'accessory.witchHat.name',
    price: 15,
    node: 'accessory_witch_hat',
    swapWhen: { accessoryId: 'pumpkin-head', node: 'accessory_witch_hat_on_pumpkin' },
  },
  {
    kind: 'accessory',
    id: 'pumpkin-head',
    nameId: 'accessory.pumpkinHead.name',
    price: 40,
    node: 'accessory_pumpkin_head',
  },
];

/** All shipped Crypt content. */
export const cryptContent: CryptContent = {
  coachColors,
  accessories,
  accessoryAsset: '/assets/coach/coach_accessories.glb',
  previewExerciseId: 'grave-rise',
};

/** The Coach color with this Option_Id, or undefined. */
export function findCoachColor(id: string): CoachColorEntry | undefined {
  return cryptContent.coachColors.find((color) => color.id === id);
}

/** The Accessory with this Option_Id, or undefined. */
export function findAccessory(id: string): AccessoryEntry | undefined {
  return cryptContent.accessories.find((accessory) => accessory.id === id);
}

const optionIdPattern = /^[a-z][a-z0-9-]{0,39}$/;
const nodePattern = /^accessory_[a-z0-9_]+$/;
const minPrice = 1;
const maxPrice = 999;

function isPriceInRange(price: number | undefined): boolean {
  return (
    price !== undefined && Number.isInteger(price) && price >= minPrice && price <= maxPrice
  );
}

/**
 * Returns every Crypt rule the content breaks, each rule at most once per
 * subject. Subjects are the Option_Id, `color#<index>` or `accessory#<index>`
 * when the id is missing, and `accessoryAsset` or `previewExerciseId`.
 * Valid content gives an empty list.
 */
export function validateCryptContent(
  draft: CryptDraft,
  entries: readonly ExerciseDraft[],
): readonly CryptViolation[] {
  const violations: CryptViolation[] = [];
  const add = (subjectId: string, rules: Iterable<CryptRule>): void => {
    for (const rule of new Set(rules)) violations.push({ subjectId, rule });
  };

  const colors = draft.coachColors ?? [];
  const wearables = draft.accessories ?? [];
  const seenIds = new Set<string>();
  const seenNodes = new Set<string>();
  const accessoryIdSet = new Set(wearables.map((accessory) => accessory.id));

  const freeCount = colors.filter((color) => color.price === 0).length;
  if (freeCount < 2 || freeCount > 3) add('coachColors', ['free-color-count']);
  if (colors.filter((color) => color.isDefault === true).length !== 1) {
    add('coachColors', ['default-color-count']);
  }

  const idRules = (id: string | undefined): CryptRule[] => {
    const rules: CryptRule[] = [];
    if (id === undefined || !optionIdPattern.test(id)) rules.push('option-id-format');
    if (id !== undefined) {
      if (seenIds.has(id)) rules.push('option-id-duplicate');
      seenIds.add(id);
    }
    return rules;
  };

  colors.forEach((color, index) => {
    const rules = idRules(color.id);
    if (color.isDefault === true && color.price !== 0) rules.push('default-color-price');
    if (color.price !== 0 && !isPriceInRange(color.price)) rules.push('color-price');
    add(color.id ?? `color#${index}`, rules);
  });

  wearables.forEach((accessory, index) => {
    const rules = idRules(accessory.id);
    if (!isPriceInRange(accessory.price)) rules.push('accessory-price');

    const nodes: (string | undefined)[] = [accessory.node];
    if (accessory.swapWhen !== undefined) nodes.push(accessory.swapWhen.node);
    for (const node of nodes) {
      if (node === undefined || !nodePattern.test(node)) rules.push('node-format');
      if (node !== undefined) {
        if (seenNodes.has(node)) rules.push('node-duplicate');
        seenNodes.add(node);
      }
    }

    const referenced = [accessory.swapWhen?.accessoryId, accessory.hiddenBy];
    for (const other of referenced) {
      if (other === undefined) continue;
      if (other === accessory.id) rules.push('combination-self');
      else if (!accessoryIdSet.has(other)) rules.push('combination-unknown');
    }

    add(accessory.id ?? `accessory#${index}`, rules);
  });

  const asset = draft.accessoryAsset;
  if (asset === undefined || asset.length === 0 || isBadAssetPath(asset)) {
    add('accessoryAsset', ['accessory-asset-path']);
  }

  const previewId = draft.previewExerciseId;
  if (previewId === undefined || !entries.some((entry) => entry.id === previewId)) {
    add('previewExerciseId', ['preview-exercise-unknown']);
  }

  return violations;
}
