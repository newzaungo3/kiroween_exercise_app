/**
 * Mounts the parsed Coach_Asset and poses its Demo_Clip.
 *
 * Clip time is decided by the Viewer controller (`logic/playback.ts`), never
 * by the mixer's own clock: CameraRig's frame callback calls the pose
 * function registered here with `FrameOutput.clipTime`, which sets
 * `action.time` and evaluates the mixer with a zero delta (Requirement 10.6).
 *
 * The Coach shows its default look: no Coach color tint and no Accessory in
 * this ticket (Requirement 5.6).
 *
 * R3F never disposes the contents of a `<primitive object>`, so on unmount
 * this component stops the mixer, uncaches the clip and the root, and
 * disposes the Coach's geometries, materials and textures (Requirement 5.8).
 */
import { useEffect, type RefObject } from 'react';
import { AnimationMixer, LoopRepeat } from 'three';

import type { ParsedCoach } from './coach-asset';
import { disposeObject3D } from './dispose';

/** Holds the function that poses the Demo_Clip at a clip time in seconds, while a Coach is mounted. */
export type ClipPoser = RefObject<((clipTime: number) => void) | null>;

export interface CoachActorProps {
  readonly coach: ParsedCoach;
  readonly poser: ClipPoser;
}

export function CoachActor({ coach, poser }: CoachActorProps) {
  const { root, clip } = coach;

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
