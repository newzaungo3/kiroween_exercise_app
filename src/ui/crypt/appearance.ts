/**
 * Builds the Viewer's Coach_Appearance from an Equipped_Look (or a Shown_Look).
 * The Viewer receives colours, nodes and a path, never Option_Ids.
 */
import { cryptContent, type CryptContent } from '@/catalog';
import type { CoachAppearance } from '@/viewer/ViewerIsland';

import { coachColorHex } from './coach-colors';
import { nodesFor, type EquippedLook } from './look';

export function appearanceOf(
  look: EquippedLook,
  options: { readonly fetchAccessories: boolean },
  content: CryptContent = cryptContent,
): CoachAppearance {
  const framingNodes: string[] = [];
  for (const entry of content.accessories) {
    framingNodes.push(entry.node);
    if (entry.swapWhen !== undefined) framingNodes.push(entry.swapWhen.node);
  }
  return {
    boneColor: coachColorHex(look.color),
    accessoryAsset: content.accessoryAsset,
    shownNodes: nodesFor(look.accessories, content),
    framingNodes,
    fetchAccessories: options.fetchAccessories,
  };
}
