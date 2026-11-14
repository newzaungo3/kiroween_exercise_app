/**
 * Mounts the parsed Coach_Asset and poses its Demo_Clip.
 *
 * Clip time is decided by the Viewer controller (`logic/playback.ts`), never
 * by the mixer's own clock: CameraRig's frame callback calls the pose
 * function registered here with `FrameOutput.clipTime`, which sets
 * `action.time` and evaluates the mixer with a zero delta (Requirement 10.6).
 *
 * The look: the `CoachBone` material is tinted with `boneColor` (null keeps
 * the asset's colour). When the parsed Accessory_Asset arrives, every
 * Accessory_Node is cloned onto the head joint and made visible so the
 * Accessory_Envelope can be measured once (reported through `onEnvelope`),
 * then only the nodes in `shownNodes` stay visible. A later change of
 * `boneColor` or `shownNodes` only tints and toggles `visible`; nothing is
 * reloaded, and `onApplied` tells Scene3D to draw one frame.
 *
 * R3F never disposes the contents of a `<primitive object>`, so on unmount
 * this component detaches the Accessory clones (their geometry belongs to
 * the parsed Accessory_Asset, which Scene3D disposes), stops the mixer,
 * uncaches the clip and the root, and disposes the Coach's geometries,
 * materials and textures (Requirement 5.8).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { AnimationMixer, Color, LoopRepeat, type Material, type Object3D } from 'three';

import type { Box3Value } from '../logic/geometry-types';
import type { ParsedAccessories } from './accessory-asset';
import { measureMotionBounds, toBox3Value, type ParsedCoach } from './coach-asset';
import { attachAccessories, boneMaterials, detachAccessories, showNodes, tintBones } from './coach-look';
import { disposeObject3D } from './dispose';

/** Holds the function that poses the Demo_Clip at a clip time in seconds, while a Coach is mounted. */
export type ClipPoser = RefObject<((clipTime: number) => void) | null>;

/** The look now on the Coach. */
export interface AppliedLook {
  /** The tint applied, or null when the asset's own colour shows. */
  readonly color: string | null;
  /** Accessory_Nodes now visible. */
  readonly nodes: readonly string[];
}

export interface CoachActorProps {
  readonly coach: ParsedCoach;
  readonly poser: ClipPoser;
  readonly boneColor?: string | null;
  readonly accessories?: ParsedAccessories | null;
  readonly shownNodes?: readonly string[];
  readonly onEnvelope?: (box: Box3Value) => void;
  readonly onApplied?: (look: AppliedLook) => void;
  readonly onAccessoryProblem?: () => void;
}

const noNodes: readonly string[] = [];

export function CoachActor({
  coach,
  poser,
  boneColor = null,
  accessories = null,
  shownNodes = noNodes,
  onEnvelope,
  onApplied,
  onAccessoryProblem,
}: CoachActorProps) {
  const { root, clip } = coach;
  const attachedRef = useRef<ReadonlyMap<string, Object3D>>(new Map());
  const shownKey = shownNodes.join('\n');

  // The latest props for effects that must not restart when they change.
  const latest = useRef({ shownNodes, onEnvelope, onApplied, onAccessoryProblem });
  useLayoutEffect(() => {
    latest.current = { shownNodes, onEnvelope, onApplied, onAccessoryProblem };
  });

  const bones = useMemo(() => {
    const materials = boneMaterials(root);
    const first: Material | undefined = materials[0];
    const color = first !== undefined && 'color' in first ? first.color : null;
    // The asset's own bone colour; Bone White when the asset has no bone material.
    return { materials, original: color instanceof Color ? color.clone() : new Color() };
  }, [root]);

  // Declared before the mixer effect so its cleanup (detach) runs before disposal.
  useEffect(() => {
    if (accessories === null) return;
    const { attached, headFound } = attachAccessories(root, accessories);
    attachedRef.current = attached;
    if (attached.size > 0) {
      showNodes(attached, [...attached.keys()]);
      latest.current.onEnvelope?.(toBox3Value(measureMotionBounds(root, clip)));
      showNodes(attached, latest.current.shownNodes);
    }
    // Reported last so a problem is not overwritten by the envelope's `ready`.
    if (!headFound || accessories.missing.length > 0) latest.current.onAccessoryProblem?.();
    return () => {
      detachAccessories(attached);
      attachedRef.current = new Map();
    };
  }, [root, clip, accessories]);

  useEffect(() => {
    tintBones(bones.materials, boneColor, bones.original);
    const nodes = showNodes(attachedRef.current, latest.current.shownNodes);
    latest.current.onApplied?.({ color: boneColor, nodes });
  }, [bones, boneColor, shownKey, accessories]);

  useEffect(() => {
    const mixer = new AnimationMixer(root);
    const action = mixer.clipAction(clip);
    action.setLoop(LoopRepeat, Infinity);
    action.play();

    const pose = (clipTime: number): void => {
      action.time = clipTime;
      mixer.update(0);
    };
    poser.current = pose;

    return () => {
      if (poser.current === pose) poser.current = null;
      mixer.stopAllAction();
      mixer.uncacheClip(clip);
      mixer.uncacheRoot(root);
      disposeObject3D(root);
    };
  }, [root, clip, poser]);

  return <primitive object={root} />;
}
