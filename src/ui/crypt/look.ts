/**
 * The Look_Rule and the Node_Rule: pure rules that turn stored choices into
 * the Equipped_Look and the Accessory_Nodes to show.
 *
 * The Progress_Store keeps raw Option_Ids and never imports the Catalog, so
 * this module checks them against the Crypt_Content: an unknown id, or an
 * option that is neither free nor Unlocked, falls back to the default.
 */
import {
  cryptContent,
  type AccessoryId,
  type CoachColorId,
  type CryptContent,
  type CryptOption,
} from '@/catalog';

export interface EquippedLook {
  readonly color: CoachColorId;
  /** Crypt_Content order. */
  readonly accessories: readonly AccessoryId[];
}

/** The structural part of a Progress_Snapshot the Look_Rule reads. */
export interface StoredChoices {
  readonly coach: {
    readonly color: string | null;
    readonly accessories: readonly string[];
  };
  readonly unlocks: readonly { readonly id: string; readonly kind: 'color' | 'accessory' }[];
}

function defaultColorId(content: CryptContent): CoachColorId {
  const entry = content.coachColors.find((color) => color.isDefault);
  // Validated content has exactly one default; 'bone' is a safe fallback.
  return entry?.id ?? 'bone';
}

export const defaultLook: EquippedLook = {
  color: defaultColorId(cryptContent),
  accessories: [],
};

/** True when the option is free or has an Unlock_Record of its kind. */
export function isOwned(option: CryptOption, unlocks: StoredChoices['unlocks']): boolean {
  if (option.price === 0) return true;
  return unlocks.some((unlock) => unlock.id === option.id && unlock.kind === option.kind);
}

/** The Look_Rule. Never throws; null or junk gives the default look. */
export function resolveLook(
  stored: StoredChoices | null,
  content: CryptContent = cryptContent,
): EquippedLook {
  if (stored === null) return { color: defaultColorId(content), accessories: [] };

  const storedColor = stored.coach.color;
  const color = content.coachColors.find(
    (entry) => entry.id === storedColor && isOwned(entry, stored.unlocks),
  );

  const accessories = content.accessories
    .filter(
      (entry) =>
        stored.coach.accessories.includes(entry.id) && isOwned(entry, stored.unlocks),
    )
    .map((entry) => entry.id);

  return { color: color?.id ?? defaultColorId(content), accessories };
}

/**
 * The Node_Rule: the Accessory_Nodes to show for these Accessories, each at
 * most once, in Crypt_Content order. An Accessory hidden by another worn one
 * shows no node, and an Accessory with a swap shows the swap node while the
 * swapping Accessory is worn.
 */
export function nodesFor(
  accessories: readonly AccessoryId[],
  content: CryptContent = cryptContent,
): readonly string[] {
  const worn = new Set<string>(accessories);
  const nodes: string[] = [];
  for (const entry of content.accessories) {
    if (!worn.has(entry.id)) continue;
    if (entry.hiddenBy !== undefined && worn.has(entry.hiddenBy)) continue;
    const swapped = entry.swapWhen !== undefined && worn.has(entry.swapWhen.accessoryId);
    const node = swapped && entry.swapWhen !== undefined ? entry.swapWhen.node : entry.node;
    if (!nodes.includes(node)) nodes.push(node);
  }
  return nodes;
}
