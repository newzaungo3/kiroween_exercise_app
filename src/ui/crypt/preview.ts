/**
 * The Preview: Locked_Options the user is trying on the Crypt_Screen's Coach.
 * Pure, kept in page memory only, never stored.
 */
import {
  cryptContent,
  type AccessoryId,
  type CoachColorId,
  type CryptContent,
} from '@/catalog';
import { isOwned, type EquippedLook, type StoredChoices } from './look';

export interface Preview {
  /** At most one Locked Coach color. */
  readonly color: CoachColorId | null;
  /** Locked Accessories, Crypt_Content order. */
  readonly accessories: readonly AccessoryId[];
}

export const emptyPreview: Preview = { color: null, accessories: [] };

export type PreviewAction =
  | { readonly type: 'toggleColor'; readonly id: CoachColorId }
  | { readonly type: 'toggleAccessory'; readonly id: AccessoryId }
  /** After an Unlock: end the Preview of this option. */
  | { readonly type: 'drop'; readonly id: string }
  | { readonly type: 'clear' };

function inContentOrder(
  ids: ReadonlySet<AccessoryId>,
  content: CryptContent,
): readonly AccessoryId[] {
  return content.accessories.filter((entry) => ids.has(entry.id)).map((entry) => entry.id);
}

/**
 * Toggling a Free option, or an id the content does not know, changes
 * nothing: Owned options use Equip. A second Coach color replaces the first.
 */
export function previewReducer(
  preview: Preview,
  action: PreviewAction,
  content: CryptContent = cryptContent,
): Preview {
  switch (action.type) {
    case 'toggleColor': {
      const entry = content.coachColors.find((color) => color.id === action.id);
      if (entry === undefined || entry.price === 0) return preview;
      return { ...preview, color: preview.color === action.id ? null : action.id };
    }
    case 'toggleAccessory': {
      const entry = content.accessories.find((accessory) => accessory.id === action.id);
      if (entry === undefined || entry.price === 0) return preview;
      const ids = new Set<AccessoryId>(preview.accessories);
      if (ids.has(action.id)) ids.delete(action.id);
      else ids.add(action.id);
      return { ...preview, accessories: inContentOrder(ids, content) };
    }
    case 'drop': {
      const color = preview.color === action.id ? null : preview.color;
      const accessories = preview.accessories.filter((id) => id !== action.id);
      if (color === preview.color && accessories.length === preview.accessories.length) {
        return preview;
      }
      return { color, accessories };
    }
    case 'clear':
      return preview.color === null && preview.accessories.length === 0
        ? preview
        : emptyPreview;
  }
}

/** Drops options that became Owned (an Unlock, or another tab). */
export function prunePreview(
  preview: Preview,
  stored: StoredChoices,
  content: CryptContent = cryptContent,
): Preview {
  const colorEntry =
    preview.color === null
      ? undefined
      : content.coachColors.find((entry) => entry.id === preview.color);
  const color =
    colorEntry === undefined || isOwned(colorEntry, stored.unlocks) ? null : preview.color;

  const accessories = preview.accessories.filter((id) => {
    const entry = content.accessories.find((accessory) => accessory.id === id);
    return entry !== undefined && !isOwned(entry, stored.unlocks);
  });

  if (color === preview.color && accessories.length === preview.accessories.length) {
    return preview;
  }
  return { color, accessories };
}

/** The Shown_Look: the Equipped_Look plus the Preview, accessories in Crypt_Content order. */
export function shownLook(
  look: EquippedLook,
  preview: Preview,
  content: CryptContent = cryptContent,
): EquippedLook {
  const ids = new Set<AccessoryId>([...look.accessories, ...preview.accessories]);
  return {
    color: preview.color ?? look.color,
    accessories: inContentOrder(ids, content),
  };
}
