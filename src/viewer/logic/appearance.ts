/**
 * The Coach_Appearance: what the Viewer is asked to show on the Coach, and
 * the pure rules around it. The UI builds it from the Equipped_Look
 * (`src/ui/crypt/appearance.ts`); the Viewer never learns a Coach color id,
 * an Accessory id or a price.
 *
 * Pure: imports nothing, so the module-boundary rule for Viewer logic holds.
 */

export interface CoachAppearance {
  /** Bone_Material colour '#rrggbb'; null keeps the asset's own colour. */
  readonly boneColor: string | null;
  /**
   * Same-origin path from the Crypt_Content; null when the caller has no
   * Accessories to offer. The island passes it to `fetchCoachAsset`, which
   * takes the Catalog's `SameOriginAssetPath`; Viewer logic may not import
   * the Catalog, so it is typed here as a plain string.
   */
  readonly accessoryAsset: string | null;
  /** Accessory_Nodes to show, from the Node_Rule. */
  readonly shownNodes: readonly string[];
  /** Every Accessory_Node that may be shown; measured once for framing. */
  readonly framingNodes: readonly string[];
  /** Fetch the Accessory_Asset even when no node is shown (the Crypt). */
  readonly fetchAccessories: boolean;
}

export const defaultAppearance: CoachAppearance = {
  boneColor: null,
  accessoryAsset: null,
  shownNodes: [],
  framingNodes: [],
  fetchAccessories: false,
};

export type AccessoryState = 'none' | 'loading' | 'ready' | 'failed';

/**
 * The asset's own bone colour, built from its channels so that no colour
 * literal sits outside the theme tokens.
 */
const assetBoneColor = `#${[245, 240, 227].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;

/** True when the Accessory_Asset must be fetched. */
export function wantsAccessoryAsset(a: CoachAppearance): boolean {
  return a.accessoryAsset !== null && (a.fetchAccessories || a.shownNodes.length > 0);
}

/** True when the look equals the pictures the Still_Images show: bone, no Accessory. */
export function isDefaultAppearance(a: CoachAppearance): boolean {
  const bone = a.boneColor === null || a.boneColor.toLowerCase() === assetBoneColor;
  return bone && a.shownNodes.length === 0;
}

/** True when the Accessory_Note shows: the asset failed and a node was wanted. */
export function showsAccessoryNote(a: CoachAppearance, state: AccessoryState): boolean {
  return state === 'failed' && a.shownNodes.length > 0;
}

/** Stable text for effect dependencies. */
export function appearanceKey(a: CoachAppearance): string {
  return JSON.stringify([
    a.boneColor,
    a.accessoryAsset,
    a.shownNodes,
    a.framingNodes,
    a.fetchAccessories,
  ]);
}
