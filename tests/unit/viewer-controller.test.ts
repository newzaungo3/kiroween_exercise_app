import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  buttonTweenMs,
  createViewerController,
  presetTweenMs,
  type FrameOutput,
  type SceneInfo,
  type ViewerController,
} from '../../src/viewer/logic/controller';
import { computeFraming, type Framing } from '../../src/viewer/logic/framing';
import type { Vec3 } from '../../src/viewer/logic/geometry-types';
import {
  cameraPosition,
  clampOrbit,
  presetElevationDeg,
  rotateBy,
  tiltBy,
  zoomBy,
  type CameraPreset,
  type Orbit,
} from '../../src/viewer/logic/orbit';
import { playbackSpeeds, type PlaybackSpeed } from '../../src/viewer/logic/playback';

// ---------------------------------------------------------------------------
// Shared scene fixture (Properties 8 and 9)
// ---------------------------------------------------------------------------

/** Vertical field of view and near plane the Viewer's camera uses. */
const fovDeg = 40;
const near = 0.05;

/** Roughly the delivered Coach: 1.78 m tall, squatting a little wider and lower than it stands. */
const coachScene: SceneInfo = {
  clipDuration: 2.27,
  standingBounds: { min: { x: -0.3, y: 0, z: -0.2 }, max: { x: 0.3, y: 1.78, z: 0.2 } },
  motionBounds: { min: { x: -0.4, y: 0, z: -0.45 }, max: { x: 0.4, y: 1.78, z: 0.35 } },
};

/** Viewer_Area aspect in the Phone_Viewport (360 px wide, 320 px tall). */
const phoneAspect = 360 / 320;

/** Viewer_Area height in CSS px, used for wheel page deltas. */
const areaHeightPx = 320;

interface ReadyViewer {
  readonly controller: ViewerController;
  readonly sceneAt: number;
}

/**
 * A controller with the Coach scene set at `sceneAt`. `requestFrame` is wired
 * before the scene is set, and `before` runs on the bare controller first, so a
 * test can, for example, hide the page before the 3D scene appears.
 */
function readyViewer(options: {
  readonly reducedMotion: boolean;
  readonly sceneAt: number;
  readonly requestFrame?: () => void;
  readonly before?: (c: ViewerController) => void;
}): ReadyViewer {
  const controller = createViewerController({ reducedMotion: options.reducedMotion, fovDeg, near });
  controller.setRequestFrame(options.requestFrame ?? (() => undefined));
  options.before?.(controller);
  controller.setScene(coachScene, phoneAspect, options.sceneAt);
  return { controller, sceneAt: options.sceneAt };
}

// ---------------------------------------------------------------------------
// Command generators
// ---------------------------------------------------------------------------

/** One step of the visitor's or the browser's timeline. `dtMs` (≥ 1) passes before the step. */
type ViewerCommand =
  | { readonly kind: 'frame'; readonly dtMs: number }
  | { readonly kind: 'togglePlay'; readonly dtMs: number }
  | { readonly kind: 'speed'; readonly dtMs: number; readonly speed: PlaybackSpeed }
  | { readonly kind: 'preset'; readonly dtMs: number; readonly preset: CameraPreset }
  | { readonly kind: 'rotate'; readonly dtMs: number; readonly deltaDeg: 45 | -45 }
  | { readonly kind: 'tilt'; readonly dtMs: number; readonly deltaDeg: 15 | -15 }
  | { readonly kind: 'zoom'; readonly dtMs: number; readonly direction: 'in' | 'out' }
  | { readonly kind: 'pointerDown'; readonly dtMs: number; readonly id: number; readonly x: number; readonly y: number }
  | { readonly kind: 'pointerMove'; readonly dtMs: number; readonly id: number; readonly x: number; readonly y: number }
  | { readonly kind: 'pointerUp'; readonly dtMs: number; readonly id: number }
  | { readonly kind: 'wheel'; readonly dtMs: number; readonly deltaY: number; readonly deltaMode: 0 | 1 | 2 }
  | { readonly kind: 'visibility'; readonly dtMs: number; readonly pageHidden: boolean; readonly inView: boolean }
  | { readonly kind: 'aspect'; readonly dtMs: number; readonly aspect: number };

/** Mostly frame-to-frame gaps, sometimes long pauses that let a tween finish unobserved. */
const dtArb: fc.Arbitrary<number> = fc.oneof(
  { arbitrary: fc.integer({ min: 1, max: 40 }), weight: 4 },
  { arbitrary: fc.integer({ min: 41, max: 700 }), weight: 2 },
  { arbitrary: fc.integer({ min: 701, max: 5_000 }), weight: 1 },
);

/** Pointer ids 1–3, so a third finger and a lifted second finger both occur. */
const pointerIdArb = fc.integer({ min: 1, max: 3 });
const pointerXArb = fc.integer({ min: 0, max: 360 });
const pointerYArb = fc.integer({ min: 0, max: 320 });

const visibilityArb = fc.record({ pageHidden: fc.boolean(), inView: fc.boolean() });

const viewerCommandArb: fc.Arbitrary<ViewerCommand> = fc.oneof(
  { arbitrary: fc.record({ kind: fc.constant('frame' as const), dtMs: dtArb }), weight: 8 },
  { arbitrary: fc.record({ kind: fc.constant('togglePlay' as const), dtMs: dtArb }), weight: 2 },
  {
    arbitrary: fc.record({ kind: fc.constant('speed' as const), dtMs: dtArb, speed: fc.constantFrom(...playbackSpeeds) }),
    weight: 1,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant('preset' as const),
      dtMs: dtArb,
      preset: fc.constantFrom<CameraPreset>('front', 'side', 'back'),
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({ kind: fc.constant('rotate' as const), dtMs: dtArb, deltaDeg: fc.constantFrom<45 | -45>(45, -45) }),
    weight: 1,
  },
  {
    arbitrary: fc.record({ kind: fc.constant('tilt' as const), dtMs: dtArb, deltaDeg: fc.constantFrom<15 | -15>(15, -15) }),
    weight: 1,
  },
  {
    arbitrary: fc.record({ kind: fc.constant('zoom' as const), dtMs: dtArb, direction: fc.constantFrom<'in' | 'out'>('in', 'out') }),
    weight: 1,
  },
  {
    arbitrary: fc.record({ kind: fc.constant('pointerDown' as const), dtMs: dtArb, id: pointerIdArb, x: pointerXArb, y: pointerYArb }),
    weight: 2,
  },
  {
    arbitrary: fc.record({ kind: fc.constant('pointerMove' as const), dtMs: dtArb, id: pointerIdArb, x: pointerXArb, y: pointerYArb }),
    weight: 3,
  },
  { arbitrary: fc.record({ kind: fc.constant('pointerUp' as const), dtMs: dtArb, id: pointerIdArb }), weight: 2 },
  {
    arbitrary: fc.record({
      kind: fc.constant('wheel' as const),
      dtMs: dtArb,
      deltaY: fc.integer({ min: -500, max: 500 }),
      deltaMode: fc.constantFrom<0 | 1 | 2>(0, 1, 2),
    }),
    weight: 1,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant('visibility' as const),
      dtMs: dtArb,
      pageHidden: fc.boolean(),
      inView: fc.boolean(),
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({ kind: fc.constant('aspect' as const), dtMs: dtArb, aspect: fc.double({ min: 0.4, max: 3, noNaN: true }) }),
    weight: 1,
  },
);

/** Sends one command to the controller at `now`. Returns the frame output for `frame` commands. */
function applyCommand(c: ViewerController, cmd: ViewerCommand, now: number): FrameOutput | null {
  switch (cmd.kind) {
    case 'frame':
      return c.frame(now);
    case 'togglePlay':
      c.togglePlay();
      return null;
    case 'speed':
      c.setSpeed(cmd.speed);
      return null;
    case 'preset':
      c.goToPreset(cmd.preset, now);
      return null;
    case 'rotate':
      c.rotate(cmd.deltaDeg, now);
      return null;
    case 'tilt':
      c.tilt(cmd.deltaDeg, now);
      return null;
    case 'zoom':
      c.zoom(cmd.direction, now);
      return null;
    case 'pointerDown':
      c.pointerDown({ id: cmd.id, x: cmd.x, y: cmd.y });
      return null;
    case 'pointerMove':
      c.pointerMove({ id: cmd.id, x: cmd.x, y: cmd.y });
      return null;
    case 'pointerUp':
      c.pointerUp(cmd.id);
      return null;
    case 'wheel':
      c.wheel(cmd.deltaY, cmd.deltaMode, areaHeightPx);
      return null;
    case 'visibility':
      c.setVisibility({ pageHidden: cmd.pageHidden, inView: cmd.inView });
      return null;
    case 'aspect':
      c.setAspect(cmd.aspect);
      return null;
  }
}

// ---------------------------------------------------------------------------
// Reference model of what the Render_Loop depends on
// ---------------------------------------------------------------------------

/**
 * What the visitor and the browser have done so far, written from the
 * requirements rather than from the controller:
 *
 * - `visible`: not Page_Hidden and the Viewer_Area in view.
 * - `playing`: starts playing unless reduced motion; Play/Pause flips it.
 * - `tweenEnd`: when the running camera move ends. A Camera_Preset takes
 *   `presetTweenMs`, a Rotate, Tilt or Zoom step `buttonTweenMs`, nothing under
 *   reduced motion; a pointer going down or a wheel turn stops it where it is.
 * - `pointers`: the fingers the gesture follows (at most two; a third is
 *   ignored). A gesture is in progress while one is down.
 * - `cameraBusyUntil`: the latest time the camera may still move because of a
 *   camera input (a Camera_Control, a gesture or a Viewer_Area resize).
 */
interface RenderModel {
  visible: boolean;
  playing: boolean;
  tweenEnd: number | null;
  pointers: number[];
  cameraBusyUntil: number;
}

function cameraInput(m: RenderModel, now: number, durationMs: number): void {
  m.cameraBusyUntil = Math.max(m.cameraBusyUntil, now + durationMs);
}

function modelCommand(m: RenderModel, cmd: ViewerCommand, now: number, reducedMotion: boolean): void {
  const tweenMs = (ms: number): number => (reducedMotion ? 0 : ms);
  switch (cmd.kind) {
    case 'frame':
    case 'speed':
      return;
    case 'togglePlay':
      m.playing = !m.playing;
      return;
    case 'preset':
    case 'rotate':
    case 'tilt':
    case 'zoom': {
      const ms = tweenMs(cmd.kind === 'preset' ? presetTweenMs : buttonTweenMs);
      m.tweenEnd = ms > 0 ? now + ms : null;
      cameraInput(m, now, ms);
      return;
    }
    case 'pointerDown':
      m.tweenEnd = null;
      if (!m.pointers.includes(cmd.id) && m.pointers.length < 2) m.pointers.push(cmd.id);
      cameraInput(m, now, 0);
      return;
    case 'pointerMove':
      cameraInput(m, now, 0);
      return;
    case 'pointerUp':
      m.pointers = m.pointers.filter((id) => id !== cmd.id);
      cameraInput(m, now, 0);
      return;
    case 'wheel':
      m.tweenEnd = null;
      cameraInput(m, now, 0);
      return;
    case 'visibility':
      m.visible = !cmd.pageHidden && cmd.inView;
      return;
    case 'aspect':
      cameraInput(m, now, 0);
      return;
  }
}

/** Whether a frame drawn at `now` should be followed by another, per the Render_Loop rule. */
function modelKeepDrawing(m: RenderModel, now: number): boolean {
  if (m.tweenEnd !== null && now >= m.tweenEnd) m.tweenEnd = null;
  const tweenActive = m.tweenEnd !== null;
  return m.visible && (m.playing || tweenActive || m.pointers.length > 0);
}

// ---------------------------------------------------------------------------
// Expected camera views (Property 9), from the public framing and orbit maths
// ---------------------------------------------------------------------------

/** Requirement 7.1: Front 0°, Side 90° (the Coach's left), Back 180°. */
const requiredPresetAzimuthDeg: { readonly [P in CameraPreset]: number } = { front: 0, side: 90, back: 180 };

/** Requirement 7.4: a Camera_Preset move ends within 600 ms. */
const presetDeadlineMs = 600;

/** Requirement 7.5: one Zoom in multiplies the Camera_Distance by 0.8, Zoom out divides by it. */
const zoomInFactor = 0.8;

/** Camera positions are compared to the micrometre. */
const positionTolerance = 1e-6;

function framingAt(aspect: number): Framing {
  return computeFraming({
    standingBounds: coachScene.standingBounds,
    motionBounds: coachScene.motionBounds,
    aspect,
    fovDeg,
    near,
  });
}

function presetView(preset: CameraPreset, framing: Framing): Orbit {
  return clampOrbit(
    {
      azimuthDeg: requiredPresetAzimuthDeg[preset],
      elevationDeg: presetElevationDeg,
      distance: framing.presetDistance[preset],
    },
    framing.limits,
  );
}

/** Reads the orbit a frame shows back from its camera position and Orbit_Target. */
function orbitShown(output: FrameOutput): Orbit {
  const dx = output.cameraPosition.x - output.target.x;
  const dy = output.cameraPosition.y - output.target.y;
  const dz = output.cameraPosition.z - output.target.z;
  const distance = Math.hypot(dx, dy, dz);
  const toDeg = 180 / Math.PI;
  return {
    azimuthDeg: Math.atan2(dx, dz) * toDeg,
    elevationDeg: Math.asin(dy / distance) * toDeg,
    distance,
  };
}

function expectSamePosition(actual: Vec3, expected: Vec3): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(positionTolerance);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(positionTolerance);
  expect(Math.abs(actual.z - expected.z)).toBeLessThanOrEqual(positionTolerance);
}

/** One Camera_Control activation: a Camera_Preset, Rotate, Tilt or Zoom button. */
type CameraButton =
  | { readonly kind: 'preset'; readonly preset: CameraPreset }
  | { readonly kind: 'rotate'; readonly deltaDeg: 45 | -45 }
  | { readonly kind: 'tilt'; readonly deltaDeg: 15 | -15 }
  | { readonly kind: 'zoom'; readonly direction: 'in' | 'out' };

const cameraButtonArb: fc.Arbitrary<CameraButton> = fc.oneof(
  fc.record({ kind: fc.constant('preset' as const), preset: fc.constantFrom<CameraPreset>('front', 'side', 'back') }),
  fc.record({ kind: fc.constant('rotate' as const), deltaDeg: fc.constantFrom<45 | -45>(45, -45) }),
  fc.record({ kind: fc.constant('tilt' as const), deltaDeg: fc.constantFrom<15 | -15>(15, -15) }),
  fc.record({ kind: fc.constant('zoom' as const), direction: fc.constantFrom<'in' | 'out'>('in', 'out') }),
);

function pressButton(c: ViewerController, button: CameraButton, now: number): void {
  switch (button.kind) {
    case 'preset':
      c.goToPreset(button.preset, now);
      return;
    case 'rotate':
      c.rotate(button.deltaDeg, now);
      return;
    case 'tilt':
      c.tilt(button.deltaDeg, now);
      return;
    case 'zoom':
      c.zoom(button.direction, now);
      return;
  }
}

/** Where a button press from the resting view `from` should leave the camera, per Requirements 7.1 and 7.5. */
function buttonTarget(button: CameraButton, from: Orbit, framing: Framing): Orbit {
  switch (button.kind) {
    case 'preset':
      return presetView(button.preset, framing);
    case 'rotate':
      return rotateBy(from, button.deltaDeg, framing.limits);
    case 'tilt':
      return tiltBy(from, button.deltaDeg, framing.limits);
    case 'zoom':
      return zoomBy(from, button.direction === 'in' ? zoomInFactor : 1 / zoomInFactor, framing.limits);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Viewer controller', () => {
  // Feature: exercise-page-3d-coach, Property 8: The Render_Loop runs only while something visible changes
  // **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 11.3, 11.4**
  it('the Render_Loop runs only while something visible changes', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.option(visibilityArb, { nil: undefined }),
        fc.array(viewerCommandArb, { maxLength: 120 }),
        (reducedMotion, sceneAt, initialVisibility, commands) => {
          const model: RenderModel = {
            visible: initialVisibility === undefined || (!initialVisibility.pageHidden && initialVisibility.inView),
            playing: !reducedMotion,
            tweenEnd: null,
            pointers: [],
            cameraBusyUntil: sceneAt,
          };

          // requestFrame is never called while the Viewer is not visible.
          let requestedWhileHidden = 0;
          const requestFrame = (): void => {
            if (!model.visible) requestedWhileHidden += 1;
          };

          const { controller } = readyViewer({
            reducedMotion,
            sceneAt,
            requestFrame,
            before: (c) => {
              if (initialVisibility !== undefined) c.setVisibility(initialVisibility);
            },
          });

          let now = sceneAt;
          let previous: { readonly at: number; readonly output: FrameOutput } | null = null;

          for (const cmd of commands) {
            now += cmd.dtMs;
            // The model is updated first, so the spy sees the visibility the command sets.
            modelCommand(model, cmd, now, reducedMotion);
            const output = applyCommand(controller, cmd, now);
            expect(requestedWhileHidden).toBe(0);
            expect(controller.getSnapshot().playing).toBe(model.playing);
            if (output === null) continue;

            // keepDrawing is true exactly when visible and playing, tweening or in a gesture.
            expect(output.keepDrawing).toBe(modelKeepDrawing(model, now));

            // The camera holds still between two frames unless a camera input
            // happened after the earlier frame, or a camera move started by one
            // was still running when the earlier frame was drawn.
            if (previous !== null && model.cameraBusyUntil <= previous.at) {
              expect(output.cameraPosition).toEqual(previous.output.cameraPosition);
              expect(output.target).toEqual(previous.output.target);
            }
            previous = { at: now, output };
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // Feature: exercise-page-3d-coach, Property 9: Presets and buttons land on time, instantly under reduced motion
  // **Validates: Requirements 7.1, 7.4, 11.2**
  it('Camera_Presets and camera buttons land on time, instantly under reduced motion', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.array(viewerCommandArb, { maxLength: 60 }),
        cameraButtonArb,
        dtArb,
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 5 }),
        fc.integer({ min: 0, max: 1_000 }),
        (reducedMotion, sceneAt, prefix, button, pressDelayMs, betweenShares, lateMs) => {
          const { controller } = readyViewer({ reducedMotion, sceneAt });

          // Reach an arbitrary starting view through the public commands.
          let now = sceneAt;
          let aspect = phoneAspect;
          for (const cmd of prefix) {
            now += cmd.dtMs;
            applyCommand(controller, cmd, now);
            if (cmd.kind === 'aspect') aspect = cmd.aspect;
          }
          // End any gesture and let any camera move finish, then read the resting view.
          for (const id of [1, 2, 3]) controller.pointerUp(id);
          now += 5_000;
          const rest = controller.frame(now);
          const framing = framingAt(aspect);
          const expectedTarget = framing.target;
          expectSamePosition(rest.target, expectedTarget);

          const expectedView = buttonTarget(button, orbitShown(rest), framing);
          const expectedPosition = cameraPosition(expectedView, expectedTarget);

          const pressAt = now + pressDelayMs;
          pressButton(controller, button, pressAt);
          if (button.kind === 'preset') expect(controller.getSnapshot().activePreset).toBe(button.preset);

          // Frames drawn while the camera may still be moving; under reduced
          // motion every one of them already shows the new view.
          const deadline = pressAt + (reducedMotion ? 0 : presetDeadlineMs);
          const betweenTimes = betweenShares.map((share) => pressAt + share * (deadline - pressAt)).sort((a, b) => a - b);
          for (const at of betweenTimes) {
            const output = controller.frame(at);
            if (reducedMotion) expectSamePosition(output.cameraPosition, expectedPosition);
          }

          // The first frame at or after the deadline shows the new view.
          const landing = controller.frame(deadline + lateMs);
          expectSamePosition(landing.cameraPosition, expectedPosition);
          expectSamePosition(landing.target, expectedTarget);
          if (!controller.getSnapshot().playing) expect(landing.keepDrawing).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('the Camera_Presets sit at the required angles and move within 600 ms', () => {
    expect(presetElevationDeg).toBeLessThanOrEqual(10);
    expect(presetTweenMs).toBeLessThanOrEqual(presetDeadlineMs);
  });

  it('the first 3D view is the Front Camera_Preset', () => {
    const { controller, sceneAt } = readyViewer({ reducedMotion: false, sceneAt: 1_000 });
    expect(controller.getSnapshot()).toMatchObject({ ready: true, activePreset: 'front' });
    const first = controller.frame(sceneAt);
    const framing = framingAt(phoneAspect);
    expectSamePosition(first.cameraPosition, cameraPosition(presetView('front', framing), framing.target));
    expect(first.clipTime).toBe(0);
  });

  it('pausing stops the Render_Loop after one frame', () => {
    let requests = 0;
    const { controller, sceneAt } = readyViewer({
      reducedMotion: false,
      sceneAt: 0,
      requestFrame: () => {
        requests += 1;
      },
    });
    expect(controller.frame(sceneAt + 16).keepDrawing).toBe(true);
    requests = 0;

    controller.togglePlay();
    expect(controller.getSnapshot().playing).toBe(false);
    // The pause itself asks for one frame, which then ends the Render_Loop.
    expect(requests).toBe(1);
    const afterPause = controller.frame(sceneAt + 32);
    expect(afterPause.keepDrawing).toBe(false);

    // Nothing asks for another frame while the Coach stays paused.
    expect(requests).toBe(1);
  });

  it('a Camera_Control while paused draws until the camera stops', () => {
    let requests = 0;
    const { controller, sceneAt } = readyViewer({
      reducedMotion: false,
      sceneAt: 0,
      requestFrame: () => {
        requests += 1;
      },
    });
    controller.togglePlay();
    expect(controller.frame(sceneAt + 16).keepDrawing).toBe(false);
    requests = 0;

    const pressAt = sceneAt + 100;
    controller.rotate(45, pressAt);
    expect(requests).toBe(1);

    let at = pressAt;
    let last = controller.frame(at);
    while (at < pressAt + buttonTweenMs) {
      expect(last.keepDrawing).toBe(true);
      at += 16;
      last = controller.frame(at);
    }
    // The first frame at or after the end of the move stops the Render_Loop.
    expect(last.keepDrawing).toBe(false);
    const stopped = last.cameraPosition;
    expect(controller.frame(at + 500).cameraPosition).toEqual(stopped);
  });

  it('returning to the page continues from the frame it stopped on', () => {
    let requests = 0;
    const { controller, sceneAt } = readyViewer({
      reducedMotion: false,
      sceneAt: 0,
      requestFrame: () => {
        requests += 1;
      },
    });
    let at = sceneAt;
    for (let i = 0; i < 10; i += 1) {
      at += 16;
      controller.frame(at);
    }
    const before = controller.frame((at += 16)).clipTime;
    expect(before).toBeGreaterThan(0);

    controller.setVisibility({ pageHidden: true, inView: true });
    requests = 0;
    // Frames that still arrive while the page is hidden hold the Coach still and stop the loop.
    const hidden = controller.frame((at += 3_000));
    expect(hidden.clipTime).toBe(before);
    expect(hidden.keepDrawing).toBe(false);
    expect(requests).toBe(0);

    at += 60_000;
    controller.setVisibility({ pageHidden: false, inView: true });
    expect(requests).toBe(1);
    expect(controller.getSnapshot().playing).toBe(true);

    // The first frame back shows the frame it stopped on; the next one moves on by one frame gap.
    const back = controller.frame((at += 16));
    expect(back.clipTime).toBe(before);
    expect(back.keepDrawing).toBe(true);
    const next = controller.frame((at += 16));
    expect(next.clipTime).toBeCloseTo(before + 0.016, 9);
  });

  it('two quick Rotate left presses end 90° away', () => {
    const { controller, sceneAt } = readyViewer({ reducedMotion: false, sceneAt: 0 });
    controller.frame(sceneAt);
    controller.rotate(45, sceneAt + 10);
    controller.frame(sceneAt + 26);
    controller.rotate(45, sceneAt + 60);
    const landed = controller.frame(sceneAt + 60 + buttonTweenMs);

    const framing = framingAt(phoneAspect);
    const front = presetView('front', framing);
    const expected = cameraPosition({ ...front, azimuthDeg: 90 }, framing.target);
    expectSamePosition(landed.cameraPosition, expected);
    expect(controller.getSnapshot().activePreset).toBeNull();
  });
});
