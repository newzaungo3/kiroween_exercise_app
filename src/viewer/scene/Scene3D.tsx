'use client';

/**
 * The 3D part of the Viewer: the R3F canvas with the Graveyard_Scene and the
 * Coach. Loaded only through `next/dynamic(() => import('./scene/Scene3D'),
 * { ssr: false })` in the Viewer island, so no other screen downloads
 * Three.js (Requirement 13.6).
 *
 * The island renders one Scene3D per load attempt (`key={attempt}`), hidden
 * under the Loading art while the Coach_Asset downloads, and passes the bytes
 * in `buffer` when the fetch finishes. Scene3D then:
 *
 * 1. parses the bytes (`parseCoachAsset`); a failure reports
 *    `onFailed(attempt, 'parse' | 'missing-clip')` (Requirement 9.7);
 * 2. mounts the Coach, hands the measured bounds to the controller
 *    (`controller.setScene`: Front Camera_Preset, Demo_Clip at its first
 *    frame, Requirement 7.3) and reports `onReady(attempt)`;
 * 3. reports `onContextLost(attempt)` if the WebGL context is lost while it
 *    is mounted (Requirement 9.8).
 *
 * The context-loss listener is removed in a layout-effect cleanup, before
 * R3F's own teardown calls `forceContextLoss()`, so leaving the page or a
 * Retry never reports a loss. The load reducer also ignores reports from an
 * older attempt.
 *
 * R3F draws on demand only (`frameloop="demand"`); CameraRig decides when
 * another frame is needed. Tone mapping is off (`flat`) so token colours
 * render as written. No shadows and no post-processing (Requirement 5.3).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { LoaderUtils } from 'three';

import { colors } from '@/ui/theme/tokens';

import { cameraFarM, cameraFovDeg, cameraNearM } from '../logic/camera-lens';
import type { ViewerController } from '../logic/controller';
import { CoachAssetError } from '../logic/load-state';
import { CameraRig } from './CameraRig';
import { CoachActor } from './CoachActor';
import { parseCoachAsset, type ParsedCoach } from './coach-asset';
import { disposeObject3D } from './dispose';
import { Graveyard } from './Graveyard';

export type SceneFailure = 'parse' | 'missing-clip';

export interface Scene3DProps {
  /** The load attempt this scene belongs to; echoed in every report. */
  readonly attempt: number;
  /** The Coach_Asset bytes; null until the fetch finishes. */
  readonly buffer: ArrayBuffer | null;
  /** The Exercise_Entry's Coach_Asset path, used only to resolve files the asset names. */
  readonly assetPath: string;
  /** The Exercise_Entry's Demo_Clip name. */
  readonly demoClip: string;
  /** The Viewer controller of this attempt, created with the lens in `logic/camera-lens.ts`. */
  readonly controller: ViewerController;
  readonly onReady: (attempt: number) => void;
  readonly onFailed: (attempt: number, reason: SceneFailure) => void;
  readonly onContextLost: (attempt: number) => void;
}

interface Reports {
  readonly onReady: Scene3DProps['onReady'];
  readonly onFailed: Scene3DProps['onFailed'];
  readonly onContextLost: Scene3DProps['onContextLost'];
}

function failureOf(error: unknown): SceneFailure {
  return error instanceof CoachAssetError && error.reason === 'missing-clip' ? 'missing-clip' : 'parse';
}

interface SceneReadyProps {
  readonly coach: ParsedCoach;
  readonly controller: ViewerController;
  readonly onShown: () => void;
}

/**
 * Rendered after CoachActor, so its effect runs once the Coach is mounted and
 * its pose function registered: hands the bounds to the controller with the
 * current aspect ratio, then reports the 3D scene as shown.
 */
function SceneReady({ coach, controller, onShown }: SceneReadyProps) {
  const get = useThree((state) => state.get);
  useEffect(() => {
    const { width, height } = get().size;
    controller.setScene(coach.info, height > 0 ? width / height : 1, performance.now());
    onShown();
  }, [coach, controller, get, onShown]);
  return null;
}

export default function Scene3D({
  attempt,
  buffer,
  assetPath,
  demoClip,
  controller,
  onReady,
  onFailed,
  onContextLost,
}: Scene3DProps) {
  const [coach, setCoach] = useState<ParsedCoach | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const poser = useRef<((clipTime: number) => void) | null>(null);

  // The latest callbacks, so a parent re-render with new inline functions
  // neither restarts the parse nor re-adds the context-loss listener.
  const reports = useRef<Reports>({ onReady, onFailed, onContextLost });
  useLayoutEffect(() => {
    reports.current = { onReady, onFailed, onContextLost };
  });

  const onShown = useCallback(() => {
    reports.current.onReady(attempt);
  }, [attempt]);

  useEffect(() => {
    if (buffer === null) return;
    let current = true;
    parseCoachAsset(buffer, demoClip, LoaderUtils.extractUrlBase(assetPath)).then(
      (parsed) => {
        if (current) setCoach(parsed);
        else disposeObject3D(parsed.root);
      },
      (error: unknown) => {
        if (current) reports.current.onFailed(attempt, failureOf(error));
      },
    );
    return () => {
      current = false;
    };
  }, [attempt, buffer, assetPath, demoClip]);

  // Releases the Coach if the canvas never mounted CoachActor (it disposes on
  // its own unmount otherwise). Disposing twice is harmless in Three.js.
  useEffect(
    () => () => {
      if (coach !== null) disposeObject3D(coach.root);
    },
    [coach],
  );

  useLayoutEffect(() => {
    if (canvas === null) return;
    let listening = true;
    const onLost = (): void => {
      if (listening) reports.current.onContextLost(attempt);
    };
    canvas.addEventListener('webglcontextlost', onLost);
    return () => {
      listening = false;
      canvas.removeEventListener('webglcontextlost', onLost);
    };
  }, [attempt, canvas]);

  return (
    <Canvas
      frameloop="demand"
      flat
      dpr={[1, 2]}
      shadows={false}
      gl={{ antialias: true, alpha: false, powerPreference: 'low-power' }}
      camera={{ fov: cameraFovDeg, near: cameraNearM, far: cameraFarM }}
      onCreated={({ gl }) => {
        setCanvas(gl.domElement);
      }}
      aria-hidden
    >
      <color attach="background" args={[colors.sceneSky]} />
      <fog attach="fog" args={[colors.sceneSky, 8, 22]} />
      <hemisphereLight args={[colors.sceneAmbientSky, colors.sceneAmbientGround, 0.9]} />
      <directionalLight position={[-3, 6, -8]} color={colors.sceneMoonlight} intensity={1.2} />
      <Graveyard />
      {coach !== null && <CoachActor coach={coach} poser={poser} />}
      {coach !== null && <SceneReady coach={coach} controller={controller} onShown={onShown} />}
      <CameraRig controller={controller} poser={poser} />
    </Canvas>
  );
}
