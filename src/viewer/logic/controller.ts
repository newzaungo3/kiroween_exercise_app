/**
 * The Viewer controller: the one object Scene3D and the Viewer island talk to.
 *
 * It owns the camera (orbit, tween, gesture), the Demo_Clip playback clock and
 * the framing derived from the Coach's bounds, and it decides whether the
 * Render_Loop draws another frame:
 *
 *   keepDrawing = visible && ((playing && !held) || cameraTweenActive || gestureActive)
 *   visible     = !pageHidden && inView
 *
 * `held` is the Coach_Hold, a boolean the host sets with `setHold`. While held,
 * the Demo_Clip is suspended like a hidden Viewer (the first frame after the
 * release advances it by 0), Play/Pause is ignored and `playing` is unchanged.
 * The camera stays live. A hold set before the scene is ready still applies.
 *
 * Commands that change the picture call the `requestFrame` hook (Scene3D wires
 * it to R3F's `invalidate`), but never while the Viewer is not visible. When
 * the Viewer becomes visible again the hook is called once.
 *
 * The camera moves only on a visitor gesture or a Camera_Control: there is no
 * inertia and no auto-rotate (Requirements 11.3, 11.4). Under the
 * Reduced_Motion_Preference every Camera_Control lands in a single frame
 * (Requirement 11.2).
 *
 * Time arrives as `now` arguments in milliseconds, all from one monotonic
 * source chosen by the caller (`performance.now()` in the browser, an injected
 * clock in tests). The controller owns no shared clock, and Playback_Speed only
 * scales the Demo_Clip inside `playback.ts`, so it cannot affect Workout time.
 *
 * Pure module: no React, Three.js, DOM or storage imports. State lives only in
 * memory for the current visit (Requirement 8.8).
 */

import { computeFraming, type Framing } from './framing';
import type { Box3Value, Vec3 } from './geometry-types';
import {
  gestureDown,
  gestureMove,
  gestureUp,
  idleGesture,
  wheelZoom,
  type GestureState,
  type PointerSample,
} from './gestures';
import {
  cameraPosition,
  clampOrbit,
  presetAzimuthDeg,
  presetElevationDeg,
  rotateBy,
  sampleTween,
  startTween,
  tiltBy,
  zoomBy,
  type CameraPreset,
  type CameraTween,
  type Orbit,
} from './orbit';
import {
  createPlayback,
  setSpeed as setPlaybackSpeed,
  suspend,
  tick,
  togglePlay as togglePlayback,
  type PlaybackSpeed,
  type PlaybackState,
} from './playback';

/** What Scene3D measured in the parsed Coach_Asset. */
export interface SceneInfo {
  /** Demo_Clip length in seconds, > 0. */
  readonly clipDuration: number;
  /** Bounds in the bind (rest) pose. */
  readonly standingBounds: Box3Value;
  /** Union of the bounds over sampled frames of the Demo_Clip. */
  readonly motionBounds: Box3Value;
}

/** The state the Playback_Controls and Camera_Controls show. Stable between changes. */
export interface ViewerSnapshot {
  /** True once `setScene` has run. */
  readonly ready: boolean;
  readonly playing: boolean;
  readonly speed: PlaybackSpeed;
  /** The Camera_Preset the camera is at or moving to; null after any other camera change. */
  readonly activePreset: CameraPreset | null;
  /** True while the Coach_Hold is on. */
  readonly held: boolean;
}

/** What one drawn frame shows. */
export interface FrameOutput {
  /** Demo_Clip time in seconds. */
  readonly clipTime: number;
  readonly cameraPosition: Vec3;
  /** The Orbit_Target the camera looks at. */
  readonly target: Vec3;
  /** Whether the Render_Loop should draw another frame after this one. */
  readonly keepDrawing: boolean;
}

export interface ViewerController {
  getSnapshot(): ViewerSnapshot;
  subscribe(listener: () => void): () => void;
  /** Scene3D passes R3F's `invalidate`. */
  setRequestFrame(hook: () => void): void;
  /** The Coach_Asset is parsed: camera at the Front Camera_Preset, Demo_Clip at its first frame. */
  setScene(info: SceneInfo, aspect: number, now: number): void;
  /** Viewer_Area width / height changed: recompute framing, re-clamp, re-fit if at a Camera_Preset. */
  setAspect(aspect: number): void;
  setVisibility(v: { readonly pageHidden: boolean; readonly inView: boolean }): void;
  /** Coach_Hold: on freezes the Demo_Clip without changing `playing`; off continues from where it stopped. */
  setHold(held: boolean): void;
  togglePlay(): void;
  setSpeed(speed: PlaybackSpeed): void;
  goToPreset(p: CameraPreset, now: number): void;
  /** Positive is Rotate left (towards the Side view). */
  rotate(deltaDeg: number, now: number): void;
  /** Positive is Tilt up (raises the camera). */
  tilt(deltaDeg: number, now: number): void;
  zoom(direction: 'in' | 'out', now: number): void;
  pointerDown(p: PointerSample): void;
  pointerMove(p: PointerSample): void;
  pointerUp(id: number): void;
  wheel(deltaY: number, deltaMode: 0 | 1 | 2, areaHeightPx: number): void;
  frame(now: number): FrameOutput;
}

export interface ViewerControllerOptions {
  readonly reducedMotion: boolean;
  /** Vertical field of view of the camera, in degrees. */
  readonly fovDeg: number;
  /** Camera near plane, in metres. */
  readonly near: number;
}

/** Duration of a move to a Camera_Preset (Requirement 7.4 allows up to 600 ms). */
export const presetTweenMs = 450;
/** Duration of a Rotate, Tilt or Zoom button step. */
export const buttonTweenMs = 250;
/** Distance factor of one Zoom in activation; Zoom out divides by it (Requirement 7.5). */
export const zoomStepFactor = 0.8;

const origin: Vec3 = { x: 0, y: 0, z: 0 };

interface ReadyScene {
  readonly info: SceneInfo;
  framing: Framing;
  /** The camera's resting orbit; while a tween runs, the orbit it started from or last landed on. */
  orbit: Orbit;
  tween: CameraTween | null;
  /** The orbit the last frame showed; a gesture cancels a tween here. */
  shown: Orbit;
  gesture: GestureState;
  playback: PlaybackState;
  activePreset: CameraPreset | null;
}

function validAspect(aspect: number): boolean {
  return Number.isFinite(aspect) && aspect > 0;
}

function sameOrbit(a: Orbit, b: Orbit): boolean {
  return a.azimuthDeg === b.azimuthDeg && a.elevationDeg === b.elevationDeg && a.distance === b.distance;
}

export function createViewerController(options: ViewerControllerOptions): ViewerController {
  const { reducedMotion, fovDeg, near } = options;
  const listeners = new Set<() => void>();
  let requestFrameHook: (() => void) | null = null;
  let pageHidden = false;
  let inView = true;
  let aspect = 1;
  let held = false;
  let scene: ReadyScene | null = null;
  let snapshot: ViewerSnapshot = { ready: false, playing: false, speed: 1, activePreset: null, held: false };

  const isVisible = (): boolean => !pageHidden && inView;

  function framingFor(info: SceneInfo, a: number): Framing {
    return computeFraming({
      standingBounds: info.standingBounds,
      motionBounds: info.motionBounds,
      aspect: a,
      fovDeg,
      near,
    });
  }

  function presetOrbit(s: ReadyScene, p: CameraPreset): Orbit {
    return clampOrbit(
      { azimuthDeg: presetAzimuthDeg[p], elevationDeg: presetElevationDeg, distance: s.framing.presetDistance[p] },
      s.framing.limits,
    );
  }

  /** Rebuilds the snapshot only when a shown value changed, so `useSyncExternalStore` sees a stable object. */
  function publish(): void {
    const next: ViewerSnapshot =
      scene === null
        ? { ready: false, playing: false, speed: 1, activePreset: null, held }
        : {
            ready: true,
            playing: scene.playback.playing,
            speed: scene.playback.speed,
            activePreset: scene.activePreset,
            held,
          };
    if (
      next.ready === snapshot.ready &&
      next.playing === snapshot.playing &&
      next.speed === snapshot.speed &&
      next.activePreset === snapshot.activePreset &&
      next.held === snapshot.held
    ) {
      return;
    }
    snapshot = next;
    for (const listener of [...listeners]) listener();
  }

  function requestFrame(): void {
    if (requestFrameHook !== null && isVisible()) requestFrameHook();
  }

  /** The orbit the camera shows at `now`, following a running tween. */
  function orbitAt(s: ReadyScene, now: number): Orbit {
    return s.tween === null ? s.orbit : sampleTween(s.tween, now).orbit;
  }

  /**
   * Moves the camera to `to`. Animated over `durationMs` from the pose shown at
   * `now`, or in one frame under the Reduced_Motion_Preference.
   */
  function moveCamera(s: ReadyScene, to: Orbit, now: number, durationMs: number): void {
    if (reducedMotion || durationMs <= 0) {
      s.orbit = to;
      s.tween = null;
    } else {
      const from = orbitAt(s, now);
      s.orbit = from;
      s.tween = startTween(from, to, now, durationMs);
    }
    requestFrame();
  }

  /** A button step targets from where the camera is heading, so quick presses add up. */
  function buttonStep(now: number, step: (base: Orbit, s: ReadyScene) => Orbit): void {
    const s = scene;
    if (s === null) return;
    const base = s.tween === null ? s.orbit : s.tween.to;
    s.activePreset = null;
    moveCamera(s, step(base, s), now, buttonTweenMs);
    publish();
  }

  /** A gesture takes over from any tween at the pose the last frame showed. */
  function cancelTween(s: ReadyScene): void {
    if (s.tween === null) return;
    s.orbit = s.shown;
    s.tween = null;
    if (s.activePreset !== null && !sameOrbit(s.orbit, presetOrbit(s, s.activePreset))) s.activePreset = null;
  }

  function applyGestureOrbit(s: ReadyScene, next: Orbit): void {
    if (sameOrbit(next, s.orbit)) return;
    s.orbit = next;
    s.shown = next;
    s.activePreset = null;
    requestFrame();
  }

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    setRequestFrame(hook) {
      requestFrameHook = hook;
    },

    // `now` is part of the interface for symmetry with the other commands; the
    // Demo_Clip clock starts on the first drawn frame, so it is not needed here.
    setScene(info, sceneAspect, _now) {
      if (validAspect(sceneAspect)) aspect = sceneAspect;
      const framing = framingFor(info, aspect);
      const front = clampOrbit(
        { azimuthDeg: presetAzimuthDeg.front, elevationDeg: presetElevationDeg, distance: framing.presetDistance.front },
        framing.limits,
      );
      scene = {
        info,
        framing,
        orbit: front,
        tween: null,
        shown: front,
        gesture: idleGesture,
        playback: createPlayback(info.clipDuration, reducedMotion),
        activePreset: 'front',
      };
      publish();
      requestFrame();
    },

    setAspect(nextAspect) {
      if (!validAspect(nextAspect)) return;
      aspect = nextAspect;
      const s = scene;
      if (s === null) return;
      s.framing = framingFor(s.info, aspect);
      const { limits } = s.framing;
      s.orbit = clampOrbit(s.orbit, limits);
      s.shown = clampOrbit(s.shown, limits);
      const refit = s.activePreset === null ? null : presetOrbit(s, s.activePreset);
      if (s.tween !== null) {
        s.tween = { ...s.tween, from: clampOrbit(s.tween.from, limits), to: refit ?? clampOrbit(s.tween.to, limits) };
      } else if (refit !== null) {
        s.orbit = refit;
      }
      // No requestFrame: R3F draws one frame itself after a resize (Requirement 10.1).
    },

    setVisibility(v) {
      const wasVisible = isVisible();
      pageHidden = v.pageHidden;
      inView = v.inView;
      const visible = isVisible();
      if (scene === null || wasVisible === visible) return;
      if (!visible) {
        scene.playback = suspend(scene.playback);
      } else {
        requestFrame();
      }
    },

    setHold(nextHeld) {
      if (nextHeld === held) return;
      held = nextHeld;
      const s = scene;
      if (s !== null && held) s.playback = suspend(s.playback);
      publish();
      if (s !== null && !held && s.playback.playing) requestFrame();
    },

    togglePlay() {
      const s = scene;
      if (s === null || held) return;
      s.playback = togglePlayback(s.playback);
      publish();
      requestFrame();
    },

    setSpeed(speed) {
      const s = scene;
      if (s === null || s.playback.speed === speed) return;
      s.playback = setPlaybackSpeed(s.playback, speed);
      publish();
      if (s.playback.playing && !held) requestFrame();
    },

    goToPreset(p, now) {
      const s = scene;
      if (s === null) return;
      s.activePreset = p;
      moveCamera(s, presetOrbit(s, p), now, presetTweenMs);
      publish();
    },

    rotate(deltaDeg, now) {
      buttonStep(now, (base, s) => rotateBy(base, deltaDeg, s.framing.limits));
    },

    tilt(deltaDeg, now) {
      buttonStep(now, (base, s) => tiltBy(base, deltaDeg, s.framing.limits));
    },

    zoom(direction, now) {
      const factor = direction === 'in' ? zoomStepFactor : 1 / zoomStepFactor;
      buttonStep(now, (base, s) => zoomBy(base, factor, s.framing.limits));
    },

    pointerDown(p) {
      const s = scene;
      if (s === null) return;
      cancelTween(s);
      s.gesture = gestureDown(s.gesture, p, s.orbit);
      publish();
      requestFrame();
    },

    pointerMove(p) {
      const s = scene;
      if (s === null || s.gesture.kind === 'idle') return;
      const result = gestureMove(s.gesture, p, s.orbit, s.framing.limits);
      s.gesture = result.state;
      applyGestureOrbit(s, result.orbit);
      publish();
    },

    pointerUp(id) {
      const s = scene;
      if (s === null) return;
      s.gesture = gestureUp(s.gesture, id);
    },

    wheel(deltaY, deltaMode, areaHeightPx) {
      const s = scene;
      if (s === null) return;
      cancelTween(s);
      applyGestureOrbit(s, wheelZoom(s.orbit, deltaY, deltaMode, areaHeightPx, s.framing.limits));
      publish();
    },

    frame(now) {
      const s = scene;
      if (s === null) {
        return { clipTime: 0, cameraPosition: origin, target: origin, keepDrawing: false };
      }
      if (s.tween !== null) {
        const sample = sampleTween(s.tween, now);
        s.shown = sample.orbit;
        if (sample.done) {
          s.orbit = sample.orbit;
          s.tween = null;
        }
      } else {
        s.shown = s.orbit;
      }
      const visible = isVisible();
      s.playback = visible && !held ? tick(s.playback, now) : suspend(s.playback);
      const keepDrawing =
        visible && ((s.playback.playing && !held) || s.tween !== null || s.gesture.kind !== 'idle');
      return {
        clipTime: s.playback.clipTime,
        cameraPosition: cameraPosition(s.shown, s.framing.target),
        target: s.framing.target,
        keepDrawing,
      };
    },
  };
}
