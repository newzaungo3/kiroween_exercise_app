/**
 * Imperative look changes on a mounted Coach: bone tint and Accessory nodes.
 *
 * Only the material named `CoachBone` is tinted; sockets, glow and Accessory
 * materials keep their own colours. Clones share geometry and materials with
 * the parsed Accessory_Asset, so nothing is disposed here: Scene3D disposes
 * the parsed asset at the end of the attempt.
 */
import { Color, type Material, type Object3D } from 'three';

import type { ParsedAccessories } from './accessory-asset';

const boneMaterialName = 'CoachBone';
const headJointName = 'head';

type Tintable = Material & { color: Color };

function isTintable(material: Material): material is Tintable {
  return 'color' in material && (material as { color: unknown }).color instanceof Color;
}

/** Every material named `CoachBone` under `root`, each once. */
export function boneMaterials(root: Object3D): readonly Material[] {
  const found = new Set<Material>();
  root.traverse((object) => {
    const material = (object as { material?: Material | Material[] }).material;
    if (material === undefined) return;
    for (const m of Array.isArray(material) ? material : [material]) {
      if (m.name === boneMaterialName) found.add(m);
    }
  });
  return [...found];
}

/** Sets the bone colour to `hex`; null puts the asset's own colour (`original`) back. */
export function tintBones(materials: readonly Material[], hex: string | null, original: Color): void {
  for (const material of materials) {
    if (!isTintable(material)) continue;
    if (hex === null) material.color.copy(original);
    else material.color.set(hex);
  }
}

/** Clones every parsed node onto the head joint, keeping its local transform. */
export function attachAccessories(
  root: Object3D,
  parsed: ParsedAccessories,
): { readonly attached: ReadonlyMap<string, Object3D>; readonly headFound: boolean } {
  const head = root.getObjectByName(headJointName);
  const attached = new Map<string, Object3D>();
  if (head === undefined) return { attached, headFound: false };
  for (const [name, node] of parsed.nodes) {
    const clone = node.clone();
    head.add(clone);
    attached.set(name, clone);
  }
  return { attached, headFound: true };
}

/** Shows exactly the named attached nodes; returns the names now visible. */
export function showNodes(attached: ReadonlyMap<string, Object3D>, names: readonly string[]): readonly string[] {
  const wanted = new Set(names);
  const shown: string[] = [];
  for (const [name, node] of attached) {
    node.visible = wanted.has(name);
    if (node.visible) shown.push(name);
  }
  return shown;
}

/** Removes the clones from the Coach. */
export function detachAccessories(attached: ReadonlyMap<string, Object3D>): void {
  for (const node of attached.values()) node.removeFromParent();
}
