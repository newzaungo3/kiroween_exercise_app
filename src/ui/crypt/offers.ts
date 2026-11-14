/**
 * The state of every Crypt_Option for the Crypt_Screen: ownership, equipped,
 * previewed, and the Unlock button. Pure.
 */
import {
  cryptContent,
  type AccessoryEntry,
  type CryptContent,
  type CryptOption,
} from '@/catalog';
import { isOwned, resolveLook, type StoredChoices } from './look';
import { shownLook, type Preview } from './preview';

export type UnlockButton =
  | { readonly enabled: true; readonly price: number }
  | { readonly enabled: false; readonly price: number; readonly shortBy: number };

export interface OptionState {
  readonly option: CryptOption;
  readonly ownership: 'free' | 'unlocked' | 'locked';
  readonly equipped: boolean;
  readonly previewed: boolean;
  /** null for an Owned_Option. */
  readonly unlock: UnlockButton | null;
  /** The Accessory that hides this one in the Shown_Look, if any. */
  readonly hiddenBy: AccessoryEntry | null;
}

function unlockButton(price: number, balance: number): UnlockButton {
  return balance >= price
    ? { enabled: true, price }
    : { enabled: false, price, shortBy: price - balance };
}

export function optionStates(
  stored: StoredChoices,
  balance: number,
  preview: Preview,
  content: CryptContent = cryptContent,
): {
  readonly colors: readonly OptionState[];
  readonly accessories: readonly OptionState[];
} {
  const equippedLook = resolveLook(stored, content);
  const shown = shownLook(equippedLook, preview, content);

  const base = (option: CryptOption) => {
    const owned = isOwned(option, stored.unlocks);
    const ownership: OptionState['ownership'] = !owned
      ? 'locked'
      : option.price === 0
        ? 'free'
        : 'unlocked';
    return {
      option,
      ownership,
      unlock: owned ? null : unlockButton(option.price, balance),
    };
  };

  const colors = content.coachColors.map((option): OptionState => ({
    ...base(option),
    equipped: equippedLook.color === option.id,
    previewed: preview.color === option.id,
    hiddenBy: null,
  }));

  const accessories = content.accessories.map((option): OptionState => {
    const hider =
      option.hiddenBy === undefined
        ? undefined
        : content.accessories.find((entry) => entry.id === option.hiddenBy);
    const hidden = hider !== undefined && shown.accessories.includes(hider.id);
    return {
      ...base(option),
      equipped: equippedLook.accessories.includes(option.id),
      previewed: preview.accessories.includes(option.id),
      hiddenBy: hidden ? hider : null,
    };
  });

  return { colors, accessories };
}
