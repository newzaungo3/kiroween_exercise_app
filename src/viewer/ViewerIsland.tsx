'use client';

/**
 * The Viewer island: the one client component of the Exercise_Detail_Screen.
 *
 * It holds the loading state machine (`logic/load-state.ts`), the live
 * region, the Retry button, the Still_Fallback and both control groups, and
 * it imports no 3D code. The 3D part (Three.js, React Three Fiber and the
 * Graveyard_Scene) is a separate chunk, reached only through the single
 * `import('./scene/Scene3D')` below, and requested only after the browser has
 * shown that it can create a WebGL2 context (Requirement 13.6).
 *
 * Sequence (design "Loading sequence"):
 *
 * 1. The first render, on the server and during hydration, is `checking`:
 *    Loading art, an empty live region and disabled controls. A `<noscript>`
 *    Still_Fallback covers browsers without JavaScript (Requirement 9.12).
 * 2. After hydration the WebGL2 probe runs. No WebGL2 → Still_Fallback with
 *    no Retry and no Coach_Asset request (Requirement 9.6).
 * 3. Otherwise attempt 1 starts: the Coach_Asset fetch (paths only from the
 *    Exercise_Entry, Requirement 13.7), the 10-second Slow_Load_Notice timer
 *    (wall-clock, Requirement 9.3), and Scene3D, mounted at once under the
 *    Loading art so the 3D chunk downloads in parallel.
 * 4. Scene3D parses the bytes, hands the bounds to this attempt's controller
 *    and reports ready, a parse failure or a lost context. A chunk or render
 *    error is caught by `SceneErrorBoundary` (`failed('code')`).
 * 5. Retry aborts the old fetch and remounts Scene3D with a new key, a new
 *    canvas and a new controller (Requirement 9.4).
 *
 * Look (the Crypt): the optional `appearance` prop carries the Coach color and
 * the Accessory_Nodes to show. When the look needs the Accessory_Asset, a
 * second fetch runs once per attempt next to the Coach_Asset fetch. It never
 * dispatches into the load reducer, so the Coach never waits for it and its
 * failure only sets the Accessory state (`failed`) and shows the
 * Accessory_Note. The data attributes of the Viewer_Area report the look
 * Scene3D actually applied. In the Still_Fallback a Still_Look_Note says the
 * pictures show the default look.
 *
 * Nothing is stored in browser storage, cookies or the URL (Requirement 8.8).
 */
import dynamic from 'next/dynamic';
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ErrorInfo,
  type ReactNode,
} from 'react';

import type { ExerciseEntry } from '@/catalog';
import { format, t } from '@/ui/strings';

export type { CoachAppearance } from './logic/appearance';

import { detectWebGL2 } from './browser/detect-webgl';
import { fetchCoachAsset } from './browser/fetch-coach-asset';
import { useViewerEnvironment } from './browser/useViewerEnvironment';
import { CameraControls, rotateStepDeg, tiltStepDeg } from './controls/CameraControls';
import controlStyles from './controls/controls.module.css';
import { PlaybackControls } from './controls/PlaybackControls';
import { LoadingArt } from './fallback/LoadingArt';
import { StillFallback } from './fallback/StillFallback';
import {
  defaultAppearance,
  isDefaultAppearance,
  showsAccessoryNote,
  wantsAccessoryAsset,
  type AccessoryState,
  type CoachAppearance,
} from './logic/appearance';
import { cameraFovDeg, cameraNearM } from './logic/camera-lens';
import { createViewerController, type ViewerController, type ViewerSnapshot } from './logic/controller';
import {
  announcementId,
  CoachAssetError,
  initialLoadState,
  loadReducer,
  msUntilSlow,
  showsRetry,
  wantsCoachAsset,
  type LoadPhase,
} from './logic/load-state';
import type { CameraPreset } from './logic/orbit';
import type { PlaybackSpeed } from './logic/playback';
import styles from './ViewerIsland.module.css';

/**
 * The 3D chunk. The only reference to `./scene/` outside that folder; its
 * props are inferred from the module's default export, so no type is imported
 * statically.
 */
const Scene3D = dynamic(() => import('./scene/Scene3D'), { ssr: false, loading: () => null });

/** Snapshot shown before a controller exists (server render, checking, no WebGL2). */
const idleSnapshot: ViewerSnapshot = { ready: false, playing: false, speed: 1, activePreset: null, held: false };

const noSubscription = (): (() => void) => () => undefined;
const getIdleSnapshot = (): ViewerSnapshot => idleSnapshot;

/** The load attempt a phase belongs to, or null in `checking`. */
function attemptOf(phase: LoadPhase): number | null {
  return phase.kind === 'checking' ? null : phase.attempt;
}

/** Whether Scene3D is mounted: from the start of loading until the Still_Fallback. */
function showsScene(phase: LoadPhase): boolean {
  return phase.kind === 'loading' || phase.kind === 'ready';
}

interface SceneErrorBoundaryProps {
  readonly onError: () => void;
  readonly children: ReactNode;
}

interface SceneErrorBoundaryState {
  readonly failed: boolean;
}

/**
 * Catches a 3D chunk that fails to download and any error thrown while the
 * 3D scene renders, and reports it as `failed('code')` (Requirement 9.7).
 */
class SceneErrorBoundary extends Component<SceneErrorBoundaryProps, SceneErrorBoundaryState> {
  override state: SceneErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): SceneErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    this.props.onError();
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

export interface ViewerIslandProps {
  /** The Exercise the Coach demonstrates. Asset path, Demo_Clip and Still_Images come only from here. */
  readonly exercise: ExerciseEntry;
  /** Coach_Hold: freezes the Demo_Clip and disables Play/Pause while true. Defaults to false. */
  readonly hold?: boolean;
  /** The look to show on the Coach. Defaults to the asset's own look. */
  readonly appearance?: CoachAppearance;
}

/** What one attempt knows about the Accessory_Asset. */
interface AccessoryReport {
  readonly attempt: number;
  readonly state: 'ready' | 'failed';
}

/** The look Scene3D reported for one attempt. */
interface AppliedReport {
  readonly attempt: number;
  readonly color: string | null;
  readonly nodes: readonly string[];
}

export function ViewerIsland({ exercise, hold = false, appearance = defaultAppearance }: ViewerIslandProps) {
  const [phase, dispatch] = useReducer(loadReducer, initialLoadState);
  const [accessoryDownload, setAccessoryDownload] = useState<{
    readonly attempt: number;
    readonly buffer: ArrayBuffer;
  } | null>(null);
  const [accessoryReport, setAccessoryReport] = useState<AccessoryReport | null>(null);
  const [applied, setApplied] = useState<AppliedReport | null>(null);
  const [download, setDownload] = useState<{ readonly attempt: number; readonly buffer: ArrayBuffer } | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const { pageHidden, inView, reducedMotion } = useViewerEnvironment(areaRef);

  const attempt = attemptOf(phase);
  const assetAttempt = wantsCoachAsset(phase) ? attempt : null;
  const { asset: assetPath, demoClip } = exercise.coach;

  // One controller per load attempt, created only once the probe has passed,
  // so `reducedMotion` is the browser's real value (Requirements 8.1, 11.1).
  // The controller keeps the value it was created with for the whole attempt,
  // so `reducedMotion` is deliberately not a dependency. Attempt 0 is the
  // no-WebGL2 Still_Fallback, which needs no controller.
  const controller = useMemo<ViewerController | null>(
    () =>
      attempt === null || attempt === 0
        ? null
        : createViewerController({ reducedMotion, fovDeg: cameraFovDeg, near: cameraNearM }),
    [attempt],
  );

  const subscribe = useCallback(
    (listener: () => void) => (controller === null ? noSubscription() : controller.subscribe(listener)),
    [controller],
  );
  const getSnapshot = useCallback(
    () => (controller === null ? idleSnapshot : controller.getSnapshot()),
    [controller],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getIdleSnapshot);

  // WebGL2 probe, once after hydration (Requirement 9.6).
  useEffect(() => {
    dispatch({ type: 'webgl', available: detectWebGL2(), now: performance.now() });
  }, []);

  // The Coach_Asset fetch of the current attempt. A Retry or leaving the page
  // aborts it; a late answer from an aborted fetch is ignored.
  useEffect(() => {
    if (assetAttempt === null) return undefined;
    const abort = new AbortController();
    fetchCoachAsset(assetPath, abort.signal).then(
      (buffer) => {
        if (!abort.signal.aborted) setDownload({ attempt: assetAttempt, buffer });
      },
      (error: unknown) => {
        if (abort.signal.aborted) return;
        const reason = error instanceof CoachAssetError ? error.reason : 'network';
        dispatch({ type: 'failed', attempt: assetAttempt, reason });
      },
    );
    return () => abort.abort();
  }, [assetAttempt, assetPath]);

  // The Accessory_Asset fetch: once per attempt, only when the look needs it.
  // It never dispatches into the load reducer; a failure only sets the
  // Accessory state, so the Coach never waits for it.
  const accessoryPath = appearance.accessoryAsset;
  const wantsAccessories = wantsAccessoryAsset(appearance);
  const accessoryAttempt = wantsAccessories && attempt !== null && showsScene(phase) ? attempt : null;
  useEffect(() => {
    if (accessoryAttempt === null || accessoryPath === null) return undefined;
    const abort = new AbortController();
    fetchCoachAsset(accessoryPath, abort.signal).then(
      (buffer) => {
        if (!abort.signal.aborted) setAccessoryDownload({ attempt: accessoryAttempt, buffer });
      },
      () => {
        if (!abort.signal.aborted) setAccessoryReport({ attempt: accessoryAttempt, state: 'failed' });
      },
    );
    return () => abort.abort();
  }, [accessoryAttempt, accessoryPath]);

  // The Slow_Load_Notice timer: 10 s of wall-clock time from the attempt start
  // (Requirement 9.3). A timer that fires early is set again for the rest.
  useEffect(() => {
    const first = msUntilSlow(phase, performance.now());
    if (first === null) return undefined;
    let handle: ReturnType<typeof setTimeout>;
    const fire = (): void => {
      const now = performance.now();
      dispatch({ type: 'tick', now });
      const rest = msUntilSlow(phase, now);
      if (rest !== null && rest > 0) handle = setTimeout(fire, rest);
    };
    handle = setTimeout(fire, first);
    return () => clearTimeout(handle);
  }, [phase]);

  // Browsers throttle timers in hidden tabs, so check the 10 s again when the
  // page is shown: a visitor who returns late sees the notice at once.
  useEffect(() => {
    if (!pageHidden) dispatch({ type: 'tick', now: performance.now() });
  }, [pageHidden]);

  // Page_Hidden and scrolled-away stop the Render_Loop (Requirements 10.3–10.5).
  useEffect(() => {
    controller?.setVisibility({ pageHidden, inView });
  }, [controller, pageHidden, inView]);

  // Coach_Hold from the host (the paused Workout).
  useEffect(() => {
    controller?.setHold(hold);
  }, [controller, hold]);

  const onReady = useCallback((reported: number) => dispatch({ type: 'loaded', attempt: reported }), []);
  const onFailed = useCallback(
    (reported: number, reason: 'parse' | 'missing-clip') => dispatch({ type: 'failed', attempt: reported, reason }),
    [],
  );
  const onContextLost = useCallback((reported: number) => dispatch({ type: 'contextLost', attempt: reported }), []);
  const reportAccessories = useCallback(
    (reported: number, state: AccessoryState) => {
      if (state === 'ready' || state === 'failed') setAccessoryReport({ attempt: reported, state });
    },
    [],
  );
  const reportApplied = useCallback(
    (reported: number, look: { readonly color: string | null; readonly nodes: readonly string[] }) =>
      setApplied({ attempt: reported, color: look.color, nodes: look.nodes }),
    [],
  );
  const onRetry = useCallback(() => dispatch({ type: 'retry', now: performance.now() }), []);

  const onTogglePlay = useCallback(() => controller?.togglePlay(), [controller]);
  const onSpeed = useCallback((speed: PlaybackSpeed) => controller?.setSpeed(speed), [controller]);
  const onPreset = useCallback(
    (preset: CameraPreset) => controller?.goToPreset(preset, performance.now()),
    [controller],
  );
  const onRotate = useCallback(
    (direction: 'left' | 'right') => controller?.rotate(rotateStepDeg[direction], performance.now()),
    [controller],
  );
  const onTilt = useCallback(
    (direction: 'up' | 'down') => controller?.tilt(tiltStepDeg[direction], performance.now()),
    [controller],
  );
  const onZoom = useCallback(
    (direction: 'in' | 'out') => controller?.zoom(direction, performance.now()),
    [controller],
  );

  const exerciseName = t(exercise.nameId);
  const ready = phase.kind === 'ready';
  const fallback = phase.kind === 'fallback';
  const controlsDisabled = !ready;
  const announcement = announcementId(phase);
  const sceneAttempt = attempt !== null && showsScene(phase) ? attempt : null;

  const report = accessoryReport !== null && accessoryReport.attempt === attempt ? accessoryReport.state : null;
  const accessoryState: AccessoryState = !wantsAccessories ? 'none' : (report ?? 'loading');
  const appliedNow = applied !== null && applied.attempt === sceneAttempt ? applied : null;

  return (
    <section className={styles.viewer} aria-label={t('viewer.region.label')}>
      <div
        ref={areaRef}
        className={styles.area}
        data-viewer-phase={phase.kind}
        data-coach-color={appliedNow === null ? undefined : (appliedNow.color ?? 'asset')}
        data-coach-accessories={appliedNow === null ? undefined : appliedNow.nodes.join(' ')}
        data-accessories={accessoryState}
      >
        {sceneAttempt !== null && controller !== null && (
          <div
            className={styles.stage}
            role={ready ? 'img' : undefined}
            aria-label={ready ? format('viewer.coachLabel', { exercise: exerciseName }) : undefined}
          >
            <SceneErrorBoundary
              key={sceneAttempt}
              onError={() => dispatch({ type: 'failed', attempt: sceneAttempt, reason: 'code' })}
            >
              <Scene3D
                key={sceneAttempt}
                attempt={sceneAttempt}
                buffer={download !== null && download.attempt === sceneAttempt ? download.buffer : null}
                accessoryBuffer={
                  accessoryDownload !== null && accessoryDownload.attempt === sceneAttempt
                    ? accessoryDownload.buffer
                    : null
                }
                appearance={appearance}
                onAccessories={(state) => reportAccessories(sceneAttempt, state)}
                onApplied={(look) => reportApplied(sceneAttempt, look)}
                assetPath={assetPath}
                demoClip={demoClip}
                controller={controller}
                onReady={onReady}
                onFailed={onFailed}
                onContextLost={onContextLost}
              />
            </SceneErrorBoundary>
          </div>
        )}
        {(phase.kind === 'checking' || phase.kind === 'loading') && <LoadingArt className={styles.loadingArt} />}
        {fallback && <StillFallback exercise={exercise} />}
        {fallback && !isDefaultAppearance(appearance) && (
          <p className={styles.note}>{t('viewer.fallback.look')}</p>
        )}
        <noscript>
          <StillFallback exercise={exercise} />
          <p className={styles.message}>{t('viewer.fallback.message')}</p>
        </noscript>
        <p role="status" className={styles.message}>
          {announcement === null ? '' : t(announcement)}
        </p>
        {showsRetry(phase) && (
          <button type="button" className={`${controlStyles.button} ${styles.retry}`} onClick={onRetry}>
            {t('viewer.retry')}
          </button>
        )}
      </div>
      {showsAccessoryNote(appearance, accessoryState) && <p className={styles.note}>{t('viewer.accessories.failed')}</p>}
      {!fallback && (
        <>
          <div className={styles.controls}>
            <PlaybackControls
              snapshot={snapshot}
              disabled={controlsDisabled}
              playDisabled={snapshot.held}
              onTogglePlay={onTogglePlay}
              onSpeed={onSpeed}
            />
          </div>
          <div className={styles.controls}>
            <CameraControls
              disabled={controlsDisabled}
              onPreset={onPreset}
              onRotate={onRotate}
              onTilt={onTilt}
              onZoom={onZoom}
            />
          </div>
        </>
      )}
    </section>
  );
}
