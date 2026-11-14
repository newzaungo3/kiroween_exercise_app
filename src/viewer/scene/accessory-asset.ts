/**
 * Parses the Accessory_Asset: a scene of rest-pose nodes that the Viewer
 * clones onto the Coach's head joint.
 *
 * The node names come from the caller (the Coach_Appearance), so this module
 * holds no asset path or node name. No DRACOLoader, MeshoptDecoder or
 * KTX2Loader is configured, so no decoder is ever requested.
 */
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { CoachAssetError } from '../logic/load-state';

export interface ParsedAccessories {
  /** The asset's scene; disposed at the end of the load attempt. */
  readonly scene: Object3D;
  /** Name to node (not yet cloned). */
  readonly nodes: ReadonlyMap<string, Object3D>;
  /** Requested names the asset lacks. */
  readonly missing: readonly string[];
}

/**
 * @param buffer       the Accessory_Asset bytes (binary glTF 2.0)
 * @param resourcePath the asset's own folder with a trailing slash
 * @param names        the Accessory_Nodes to find
 * @throws CoachAssetError('parse') if the loader rejects the bytes
 */
export async function parseAccessoryAsset(
  buffer: ArrayBuffer,
  resourcePath: string,
  names: readonly string[],
): Promise<ParsedAccessories> {
  const loader = new GLTFLoader();
  let scene: Object3D;
  try {
    scene = (await loader.parseAsync(buffer, resourcePath)).scene;
  } catch {
    throw new CoachAssetError('parse');
  }

  const nodes = new Map<string, Object3D>();
  const missing: string[] = [];
  for (const name of names) {
    const node = scene.getObjectByName(name);
    if (node === undefined) missing.push(name);
    else nodes.set(name, node);
  }
  return { scene, nodes, missing };
}
