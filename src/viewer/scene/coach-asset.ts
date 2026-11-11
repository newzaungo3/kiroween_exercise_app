/**
 * Parses a Coach_Asset and measures what the Viewer controller needs.
 *
 * The bytes arrive from the browser adapter's fetch; the Coach_Asset path and
 * the Demo_Clip name come from the Exercise_Entry through the caller, so this
 * module holds no asset path or clip name (Requirement 13.7) and a CC0_Fallback
 * asset of another size needs no code change (Requirement 15.5).
 *
 * No DRACOLoader, MeshoptDecoder or KTX2Loader is configured, so the Viewer
 * never requests a decoder (Requirement 13.5). A Coach_Asset that needs one
 * fails to parse and the Viewer shows the Still_Fallback (Requirement 9.7);
 * the asset budget test rejects such files before they ship (Requirement 13.3).
 */
import { AnimationMixer, Box3, LoopRepeat, type AnimationClip, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import type { SceneInfo } from '../logic/controller';
import type { Box3Value } from '../logic/geometry-types';
import { CoachAssetError, findDemoClip } from '../logic/load-state';

/** A parsed Coach_Asset, ready to mount. */
export interface ParsedCoach {
  /** The asset's scene, left in its rest pose. */
  readonly root: Object3D;
  /** The Demo_Clip. */
  readonly clip: AnimationClip;
  /** Demo_Clip duration and the bounds the framing is derived from. */
  readonly info: SceneInfo;
}

/** Number of evenly spaced Demo_Clip times sampled for the motion bounds. */
export const motionSampleCount = 30;

function toBox3Value(box: Box3): Box3Value {
  return {
    min: { x: box.min.x, y: box.min.y, z: box.min.z },
    max: { x: box.max.x, y: box.max.y, z: box.max.z },
  };
}

/** Precise world bounds of `root`; skinned meshes are measured with their bones applied. */
function preciseBounds(root: Object3D): Box3 {
  root.updateMatrixWorld(true);
  return new Box3().setFromObject(root, true);
}

interface LocalTransform {
  readonly object: Object3D;
  readonly position: Object3D['position'];
  readonly quaternion: Object3D['quaternion'];
  readonly scale: Object3D['scale'];
}

function snapshotTransforms(root: Object3D): readonly LocalTransform[] {
  const transforms: LocalTransform[] = [];
  root.traverse((object) => {
    transforms.push({
      object,
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      scale: object.scale.clone(),
    });
  });
  return transforms;
}

function restoreTransforms(transforms: readonly LocalTransform[]): void {
  for (const { object, position, quaternion, scale } of transforms) {
    object.position.copy(position);
    object.quaternion.copy(quaternion);
    object.scale.copy(scale);
  }
}

/**
 * Union of the precise bounds at `motionSampleCount` evenly spaced Demo_Clip
 * times, first and last frame included. Leaves `root` in its rest pose.
 */
function measureMotionBounds(root: Object3D, clip: AnimationClip): Box3 {
  const rest = snapshotTransforms(root);
  const mixer = new AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.setLoop(LoopRepeat, Infinity).play();

  const bounds = new Box3();
  try {
    for (let i = 0; i < motionSampleCount; i += 1) {
      action.time = (clip.duration * i) / (motionSampleCount - 1);
      mixer.update(0);
      bounds.union(preciseBounds(root));
    }
  } finally {
    mixer.stopAllAction();
    mixer.uncacheClip(clip);
    mixer.uncacheRoot(root);
    restoreTransforms(rest);
    root.updateMatrixWorld(true);
  }
  return bounds;
}

/**
 * Parses Coach_Asset bytes with GLTFLoader and finds its Demo_Clip.
 *
 * @param buffer       the Coach_Asset bytes (binary glTF 2.0)
 * @param demoClip     the Exercise_Entry's Demo_Clip name
 * @param resourcePath the Coach_Asset's own folder with a trailing slash, so
 *                     any external file the asset names resolves same-origin
 * @throws CoachAssetError('parse') if the loader rejects the bytes or the
 *         asset holds nothing to measure
 * @throws CoachAssetError('missing-clip') if no clip has the Demo_Clip name,
 *         or that clip has no length to loop
 */
export async function parseCoachAsset(
  buffer: ArrayBuffer,
  demoClip: string,
  resourcePath: string,
): Promise<ParsedCoach> {
  const loader = new GLTFLoader();
  let gltf: Awaited<ReturnType<GLTFLoader['parseAsync']>>;
  try {
    gltf = await loader.parseAsync(buffer, resourcePath);
  } catch {
    throw new CoachAssetError('parse');
  }

  const clip = findDemoClip(gltf.animations, demoClip);
  if (clip === undefined || !(clip.duration > 0) || !Number.isFinite(clip.duration)) {
    throw new CoachAssetError('missing-clip');
  }

  const root = gltf.scene;
  // Bind (rest) pose: measured before any animation is applied.
  const standing = preciseBounds(root);
  if (standing.isEmpty()) throw new CoachAssetError('parse');
  const motion = measureMotionBounds(root, clip).union(standing);

  return {
    root,
    clip,
    info: {
      clipDuration: clip.duration,
      standingBounds: toBox3Value(standing),
      motionBounds: toBox3Value(motion),
    },
  };
}
