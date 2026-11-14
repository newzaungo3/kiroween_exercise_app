import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  defaultAppearance,
  isDefaultAppearance,
  showsAccessoryNote,
  wantsAccessoryAsset,
  type AccessoryState,
  type CoachAppearance,
} from '../../src/viewer/logic/appearance';
import { createViewerController, type SceneInfo, type ViewerController } from '../../src/viewer/logic/controller';
import { clearanceM, computeFraming } from '../../src/viewer/logic/framing';
import type { Box3Value, Vec3 } from '../../src/viewer/logic/geometry-types';
import type { CameraPreset } from '../../src/viewer/logic/orbit';

const fovDeg = 40;
const near = 0.05;
const phoneAspect = 360 / 320;
const areaHeightPx = 320;

const coachScene: SceneInfo = {
  clipDuration: 2.27,
  standingBounds: { min: { x: -0.3, y: 0, z: -0.2 }, max: { x: 0.3, y: 1.78, z: 0.2 } },
  motionBounds: { min: { x: -0.4, y: 0, z: -0.45 }, max: { x: 0.4, y: 1.78, z: 0.35 } },
};

function readyViewer(options: { readonly reducedMotion: boolean; readonly requestFrame: () => void }): ViewerController {
  const controller = createViewerController({ reducedMotion: options.reducedMotion, fovDeg, near });
  controller.setRequestFrame(options.requestFrame);
  controller.setScene(coachScene, phoneAspect, 0);
  return controller;
}

function unionBox(a: Box3Value, b: Box3Value): Box3Value {
  return {
    min: { x: Math.min(a.min.x, b.min.x), y: Math.min(a.min.y, b.min.y), z: Math.min(a.min.z, b.min.z) },
    max: { x: Math.max(a.max.x, b.max.x), y: Math.max(a.max.y, b.max.y), z: Math.max(a.max.z, b.max.z) },
  };
}

function enlarge(box: Box3Value, by: number): Box3Value {
  return {
    min: { x: box.min.x - by, y: box.min.y - by, z: box.min.z - by },
    max: { x: box.max.x + by, y: box.max.y + by, z: box.max.z + by },
  };
}

/** True when `p` is strictly inside `box`. */
function strictlyInside(p: Vec3, box: Box3Value): boolean {
  return (
    p.x > box.min.x && p.x < box.max.x && p.y > box.min.y && p.y < box.max.y && p.z > box.min.z && p.z < box.max.z
  );
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const coordArb = (min: number, max: number): fc.Arbitrary<number> => fc.double({ min, max, noNaN: true, noDefaultInfinity: true });
const growthArb = coordArb(0, 1);

/** A box around the origin column; min ≤ max on every axis. */
const boxArb = (lo: number, hi: number): fc.Arbitrary<Box3Value> =>
  fc
    .tuple(coordArb(lo, hi), coordArb(lo, hi), coordArb(lo, hi), coordArb(lo, hi), coordArb(lo, hi), coordArb(lo, hi))
    .map(([a, b, c, d, e, f]) => ({
      min: { x: Math.min(a, d), y: Math.min(b, e), z: Math.min(c, f) },
      max: { x: Math.max(a, d), y: Math.max(b, e), z: Math.max(c, f) },
    }));

const standingArb: fc.Arbitrary<Box3Value> = fc
  .tuple(coordArb(0.1, 0.6), coordArb(0.1, 0.6), coordArb(0.5, 2.5))
  .map(([hx, hz, h]) => ({ min: { x: -hx, y: 0, z: -hz }, max: { x: hx, y: h, z: hz } }));

/** Motion bounds that contain the standing bounds. */
const sceneArb: fc.Arbitrary<SceneInfo> = fc
  .tuple(standingArb, fc.tuple(growthArb, growthArb, growthArb, growthArb, growthArb, growthArb))
  .map(([standing, g]) => ({
    clipDuration: 2,
    standingBounds: standing,
    motionBounds: {
      min: { x: standing.min.x - g[0], y: standing.min.y - g[1], z: standing.min.z - g[2] },
      max: { x: standing.max.x + g[3], y: standing.max.y + g[4], z: standing.max.z + g[5] },
    },
  }));

/** Around the head and above it, like a hat or a pumpkin. */
const envelopeArb = boxArb(-1.5, 3);

const aspectArb = coordArb(0.4, 2.5);

type Command =
  | { readonly kind: 'frame' }
  | { readonly kind: 'preset'; readonly preset: CameraPreset }
  | { readonly kind: 'rotate'; readonly deltaDeg: 45 | -45 }
  | { readonly kind: 'tilt'; readonly deltaDeg: 15 | -15 }
  | { readonly kind: 'zoom'; readonly direction: 'in' | 'out' }
  | { readonly kind: 'pointerDown'; readonly id: number; readonly x: number; readonly y: number }
  | { readonly kind: 'pointerMove'; readonly id: number; readonly x: number; readonly y: number }
  | { readonly kind: 'pointerUp'; readonly id: number }
  | { readonly kind: 'wheel'; readonly deltaY: number }
  | { readonly kind: 'aspect'; readonly aspect: number };

const pointerArb = { id: fc.integer({ min: 1, max: 2 }), x: fc.integer({ min: 0, max: 360 }), y: fc.integer({ min: 0, max: 320 }) };

const commandArb: fc.Arbitrary<{ readonly dtMs: number; readonly command: Command }> = fc.record({
  dtMs: fc.oneof(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 41, max: 3000 })),
  command: fc.oneof(
    fc.record({ kind: fc.constant('frame' as const) }),
    fc.record({ kind: fc.constant('preset' as const), preset: fc.constantFrom<CameraPreset>('front', 'side', 'back') }),
    fc.record({ kind: fc.constant('rotate' as const), deltaDeg: fc.constantFrom<45 | -45>(45, -45) }),
    fc.record({ kind: fc.constant('tilt' as const), deltaDeg: fc.constantFrom<15 | -15>(15, -15) }),
    fc.record({ kind: fc.constant('zoom' as const), direction: fc.constantFrom<'in' | 'out'>('in', 'out') }),
    fc.record({ kind: fc.constant('pointerDown' as const), ...pointerArb }),
    fc.record({ kind: fc.constant('pointerMove' as const), ...pointerArb }),
    fc.record({ kind: fc.constant('pointerUp' as const), id: pointerArb.id }),
    fc.record({ kind: fc.constant('wheel' as const), deltaY: fc.integer({ min: -400, max: 400 }) }),
    fc.record({ kind: fc.constant('aspect' as const), aspect: aspectArb }),
  ),
});

function apply(c: ViewerController, cmd: Command, now: number): void {
  switch (cmd.kind) {
    case 'frame':
      return;
    case 'preset':
      c.goToPreset(cmd.preset, now);
      return;
    case 'rotate':
      c.rotate(cmd.deltaDeg, now);
      return;
    case 'tilt':
      c.tilt(cmd.deltaDeg, now);
      return;
    case 'zoom':
      c.zoom(cmd.direction, now);
      return;
    case 'pointerDown':
      c.pointerDown({ id: cmd.id, x: cmd.x, y: cmd.y });
      return;
    case 'pointerMove':
      c.pointerMove({ id: cmd.id, x: cmd.x, y: cmd.y });
      return;
    case 'pointerUp':
      c.pointerUp(cmd.id);
      return;
    case 'wheel':
      c.wheel(cmd.deltaY, 0, areaHeightPx);
      return;
    case 'aspect':
      c.setAspect(cmd.aspect);
      return;
  }
}

// ---------------------------------------------------------------------------
// Property 11
// ---------------------------------------------------------------------------

describe('the Accessory_Envelope only pushes the camera out', () => {
  // Feature: the-crypt, Property 11: The Accessory_Envelope only pushes the camera out
  it('framing with the envelope has a minimum Camera_Distance at least that without it', () => {
    fc.assert(
      fc.property(sceneArb, envelopeArb, aspectArb, (scene, envelope, aspect) => {
        const base = { standingBounds: scene.standingBounds, aspect, fovDeg, near };
        const without = computeFraming({ ...base, motionBounds: scene.motionBounds });
        const withEnvelope = computeFraming({ ...base, motionBounds: unionBox(scene.motionBounds, envelope) });
        expect(withEnvelope.limits.minDistance).toBeGreaterThanOrEqual(without.limits.minDistance);
        expect(withEnvelope.target).toEqual(without.target);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: the-crypt, Property 11: The Accessory_Envelope only pushes the camera out
  it('after setAccessoryBounds the camera stays outside the enlarged envelope and the orbit target is unchanged', () => {
    fc.assert(
      fc.property(
        sceneArb,
        envelopeArb,
        fc.boolean(),
        fc.array(commandArb, { minLength: 0, maxLength: 25 }),
        (scene, envelope, reducedMotion, commands) => {
          const controller = createViewerController({ reducedMotion, fovDeg, near });
          controller.setScene(scene, phoneAspect, 0);
          const targetBefore = controller.frame(0).target;
          controller.setAccessoryBounds(envelope);
          const forbidden = enlarge(envelope, clearanceM);
          let now = 0;
          const check = (): void => {
            const out = controller.frame(now);
            expect(out.target).toEqual(targetBefore);
            expect(strictlyInside(out.cameraPosition, forbidden)).toBe(false);
          };
          check();
          for (const { dtMs, command } of commands) {
            now += dtMs;
            apply(controller, command, now);
            check();
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Controller examples
// ---------------------------------------------------------------------------

describe('redraw and setAccessoryBounds on the Viewer controller', () => {
  it('redraw calls the frame hook once while visible and paused', () => {
    let calls = 0;
    const c = readyViewer({ reducedMotion: true, requestFrame: () => (calls += 1) });
    calls = 0;
    c.redraw();
    expect(calls).toBe(1);
  });

  it('redraw calls no frame hook while hidden, then one when the Viewer becomes visible', () => {
    let calls = 0;
    const c = readyViewer({ reducedMotion: true, requestFrame: () => (calls += 1) });
    c.setVisibility({ pageHidden: true, inView: true });
    calls = 0;
    c.redraw();
    expect(calls).toBe(0);
    c.setVisibility({ pageHidden: false, inView: true });
    expect(calls).toBe(1);
    c.setVisibility({ pageHidden: false, inView: true });
    expect(calls).toBe(1);
  });

  it('keepDrawing stays false after redraw while paused', () => {
    const c = readyViewer({ reducedMotion: true, requestFrame: () => undefined });
    expect(c.frame(16).keepDrawing).toBe(false);
    c.redraw();
    expect(c.frame(32).keepDrawing).toBe(false);
  });

  it('setAccessoryBounds before setScene is ignored', () => {
    let calls = 0;
    const c = createViewerController({ reducedMotion: true, fovDeg, near });
    c.setRequestFrame(() => (calls += 1));
    c.setAccessoryBounds({ min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 5, z: 5 } });
    expect(calls).toBe(0);
    expect(c.getSnapshot().ready).toBe(false);
    c.setScene(coachScene, phoneAspect, 0);
    const plain = readyViewer({ reducedMotion: true, requestFrame: () => undefined });
    expect(c.frame(0).cameraPosition).toEqual(plain.frame(0).cameraPosition);
  });

  it('setAccessoryBounds re-fits the camera at a Camera_Preset', () => {
    const envelope: Box3Value = { min: { x: -1, y: 1.5, z: -1 }, max: { x: 1, y: 3, z: 1 } };
    const c = readyViewer({ reducedMotion: true, requestFrame: () => undefined });
    c.goToPreset('side', 0);
    c.setAccessoryBounds(envelope);
    const expected = computeFraming({
      standingBounds: coachScene.standingBounds,
      motionBounds: unionBox(coachScene.motionBounds, envelope),
      aspect: phoneAspect,
      fovDeg,
      near,
    });
    const out = c.frame(1000);
    const distance = Math.hypot(
      out.cameraPosition.x - expected.target.x,
      out.cameraPosition.y - expected.target.y,
      out.cameraPosition.z - expected.target.z,
    );
    expect(distance).toBeCloseTo(expected.presetDistance.side, 6);
    expect(c.getSnapshot().activePreset).toBe('side');
  });

  it('setAccessoryBounds requests a frame while visible', () => {
    let calls = 0;
    const c = readyViewer({ reducedMotion: true, requestFrame: () => (calls += 1) });
    calls = 0;
    c.setAccessoryBounds({ min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 3, z: 1 } });
    expect(calls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Appearance tables
// ---------------------------------------------------------------------------

const withNodes: CoachAppearance = {
  ...defaultAppearance,
  accessoryAsset: '/assets/coach/coach_accessories.glb',
  shownNodes: ['witch_hat'],
  framingNodes: ['witch_hat', 'pumpkin'],
};

describe('wantsAccessoryAsset', () => {
  const cases: ReadonlyArray<readonly [string, CoachAppearance, boolean]> = [
    ['the default appearance', defaultAppearance, false],
    ['a path with nothing shown or asked for', { ...withNodes, shownNodes: [] }, false],
    ['a path with a shown node', withNodes, true],
    ['a path with fetchAccessories and no node', { ...withNodes, shownNodes: [], fetchAccessories: true }, true],
    ['a shown node but no path', { ...withNodes, accessoryAsset: null }, false],
    ['fetchAccessories but no path', { ...defaultAppearance, fetchAccessories: true }, false],
  ];
  it.each(cases)('%s', (_name, appearance, expected) => {
    expect(wantsAccessoryAsset(appearance)).toBe(expected);
  });
});

describe('isDefaultAppearance', () => {
  const cases: ReadonlyArray<readonly [string, CoachAppearance, boolean]> = [
    ['the default appearance', defaultAppearance, true],
    ['the asset bone colour', { ...defaultAppearance, boneColor: '#f5f0e3' }, true],
    ['the asset bone colour in capitals', { ...defaultAppearance, boneColor: '#F5F0E3' }, true],
    ['another colour', { ...defaultAppearance, boneColor: '#ff7a00' }, false],
    ['a shown node', withNodes, false],
    ['a shown node and another colour', { ...withNodes, boneColor: '#ff7a00' }, false],
    ['framing nodes only', { ...defaultAppearance, framingNodes: ['witch_hat'] }, true],
  ];
  it.each(cases)('%s', (_name, appearance, expected) => {
    expect(isDefaultAppearance(appearance)).toBe(expected);
  });
});

describe('showsAccessoryNote', () => {
  const states: readonly AccessoryState[] = ['none', 'loading', 'ready', 'failed'];
  it.each(states)('with a shown node and state %s', (state) => {
    expect(showsAccessoryNote(withNodes, state)).toBe(state === 'failed');
  });
  it.each(states)('with no shown node and state %s', (state) => {
    expect(showsAccessoryNote({ ...withNodes, shownNodes: [] }, state)).toBe(false);
  });
});
