import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  degreesPerPixel,
  gestureDown,
  gestureMove,
  gestureUp,
  idleGesture,
  wheelZoom,
  type GestureState,
} from '../../src/viewer/logic/gestures';
import { zoomStepFactor } from '../../src/viewer/logic/controller';
import {
  cameraPosition,
  clampOrbit,
  normalizeAzimuth,
  presetAzimuthDeg,
  presetElevationDeg,
  rotateBy,
  sampleTween,
  startTween,
  tiltBy,
  zoomBy,
  type CameraPreset,
  type Orbit,
  type OrbitLimits,
} from '../../src/viewer/logic/orbit';

// ---------------------------------------------------------------------------
// Generators (design: "Properties 2–3")
// ---------------------------------------------------------------------------

const finite = fc.double({ noNaN: true, noDefaultInfinity: true });

const maxInt32 = 2 ** 31 - 1;

/**
 * Doubles in [min, max]. `fc.double` alone draws mostly tiny magnitudes (most
 * doubles sit near 0), so half the values are spread evenly over the range to
 * reach ordinary angles and pixel positions. A range that spans 0 is scaled
 * from 0 outwards, so small values keep a full mantissa instead of the coarse
 * grid that an offset from `min` would leave.
 */
function inRange(min: number, max: number): fc.Arbitrary<number> {
  const spread =
    min < 0 && max > 0
      ? fc.integer({ min: -maxInt32, max: maxInt32 }).map((i) => (i >= 0 ? max : -min) * (i / maxInt32))
      : fc.integer({ min: 0, max: maxInt32 }).map((i) => min + (max - min) * (i / maxInt32));
  return fc.oneof(fc.double({ min, max, noNaN: true }), spread);
}

/** Any starting orbit, also outside the limits. */
const orbitArb: fc.Arbitrary<Orbit> = fc.record({
  azimuthDeg: inRange(-1e4, 1e4),
  elevationDeg: inRange(-200, 200),
  distance: inRange(-10, 100),
});

const limitsArb: fc.Arbitrary<OrbitLimits> = fc
  .record({
    minDistance: inRange(0.2, 5),
    span: inRange(0, 10),
  })
  .map(({ minDistance, span }) => ({
    minElevationDeg: 0 as const,
    maxElevationDeg: 75 as const,
    minDistance,
    maxDistance: minDistance + span,
  }));

const pixelArb = inRange(-1e4, 1e4);
const pointArb = fc.record({ x: pixelArb, y: pixelArb });

type Point = { readonly x: number; readonly y: number };

/** One camera input of the visitor. Gestures are complete: pointers go down, move and (maybe) up. */
type CameraInput =
  | { readonly kind: 'rotate'; readonly deltaDeg: number }
  | { readonly kind: 'tilt'; readonly deltaDeg: number }
  | { readonly kind: 'zoom'; readonly factor: number }
  | { readonly kind: 'drag'; readonly start: Point; readonly moves: readonly Point[] }
  | {
      readonly kind: 'pinch';
      readonly a: Point;
      readonly b: Point;
      readonly moves: readonly { readonly finger: 'a' | 'b'; readonly to: Point }[];
      readonly lift: 'a' | 'b' | null;
    }
  | { readonly kind: 'wheel'; readonly deltaY: number; readonly deltaMode: 0 | 1 | 2; readonly areaHeightPx: number }
  | { readonly kind: 'preset'; readonly preset: CameraPreset; readonly distance: number };

const presets = Object.keys(presetAzimuthDeg) as CameraPreset[];

const inputArb: fc.Arbitrary<CameraInput> = fc.oneof(
  fc.record({
    kind: fc.constant('rotate' as const),
    deltaDeg: fc.oneof(fc.constantFrom(45, -45), inRange(-1e3, 1e3), finite),
  }),
  fc.record({
    kind: fc.constant('tilt' as const),
    deltaDeg: fc.oneof(fc.constantFrom(15, -15), inRange(-200, 200), finite),
  }),
  fc.record({
    kind: fc.constant('zoom' as const),
    factor: fc.oneof(fc.constantFrom(0.8, 1 / 0.8), inRange(-2, 10), finite),
  }),
  fc.record({
    kind: fc.constant('drag' as const),
    start: pointArb,
    moves: fc.array(pointArb, { minLength: 1, maxLength: 6 }),
  }),
  fc.record({
    kind: fc.constant('pinch' as const),
    a: pointArb,
    b: pointArb,
    moves: fc.array(fc.record({ finger: fc.constantFrom('a' as const, 'b' as const), to: pointArb }), {
      minLength: 1,
      maxLength: 6,
    }),
    lift: fc.constantFrom('a' as const, 'b' as const, null),
  }),
  fc.record({
    kind: fc.constant('wheel' as const),
    deltaY: fc.oneof(inRange(-2000, 2000), finite),
    deltaMode: fc.constantFrom(0 as const, 1 as const, 2 as const),
    areaHeightPx: inRange(1, 2000),
  }),
  fc.record({
    kind: fc.constant('preset' as const),
    preset: fc.constantFrom(...presets),
    distance: inRange(-10, 100),
  }),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Distance between two angles on the circle, in degrees. */
function angleGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

function expectWithinLimits(o: Orbit, l: OrbitLimits): void {
  expect(Number.isFinite(o.azimuthDeg)).toBe(true);
  expect(o.azimuthDeg).toBeGreaterThanOrEqual(0);
  expect(o.azimuthDeg).toBeLessThan(360);
  expect(o.elevationDeg).toBeGreaterThanOrEqual(l.minElevationDeg);
  expect(o.elevationDeg).toBeLessThanOrEqual(l.maxElevationDeg);
  expect(o.distance).toBeGreaterThanOrEqual(l.minDistance);
  expect(o.distance).toBeLessThanOrEqual(l.maxDistance);
  // A clamped orbit is a fixed point of clampOrbit.
  expect(clampOrbit(o, l)).toEqual(o);
}

const angleTolerance = 1e-6;

/**
 * Applies one camera input through the public Viewer logic and returns every
 * orbit the camera passes through, checking the drag directions on the way.
 */
function applyInput(o: Orbit, input: CameraInput, l: OrbitLimits): Orbit[] {
  switch (input.kind) {
    case 'rotate':
      return [rotateBy(o, input.deltaDeg, l)];
    case 'tilt':
      return [tiltBy(o, input.deltaDeg, l)];
    case 'zoom':
      return [zoomBy(o, input.factor, l)];
    case 'wheel':
      return [wheelZoom(o, input.deltaY, input.deltaMode, input.areaHeightPx, l)];
    case 'preset':
      return [
        clampOrbit(
          { azimuthDeg: presetAzimuthDeg[input.preset], elevationDeg: presetElevationDeg, distance: input.distance },
          l,
        ),
      ];
    case 'drag': {
      const seen: Orbit[] = [];
      let last = { id: 1, ...input.start };
      let state: GestureState = gestureDown(idleGesture, last, o);
      let orbit = o;
      for (const to of input.moves) {
        const sample = { id: 1, ...to };
        const before = clampOrbit(orbit, l);
        const moved = gestureMove(state, sample, orbit, l);
        const dx = sample.x - last.x;
        const dy = sample.y - last.y;
        // Horizontal drag: −0.4° of Azimuth per pixel, modulo 360°, never clamped.
        expect(angleGap(moved.orbit.azimuthDeg, before.azimuthDeg - dx * degreesPerPixel.azimuth)).toBeLessThan(
          angleTolerance,
        );
        // Vertical drag: +0.3° of Elevation per pixel downwards, then clamped.
        const elevation = Math.min(
          Math.max(before.elevationDeg + dy * degreesPerPixel.elevation, l.minElevationDeg),
          l.maxElevationDeg,
        );
        expect(Math.abs(moved.orbit.elevationDeg - elevation)).toBeLessThan(angleTolerance);
        // A drag does not change the Camera_Distance.
        expect(moved.orbit.distance).toBe(before.distance);
        state = moved.state;
        orbit = moved.orbit;
        last = sample;
        seen.push(orbit);
      }
      state = gestureUp(state, 1);
      expect(state.kind).toBe('idle');
      return seen;
    }
    case 'pinch': {
      const seen: Orbit[] = [];
      const ids = { a: 1, b: 2 } as const;
      let state: GestureState = gestureDown(idleGesture, { id: ids.a, ...input.a }, o);
      state = gestureDown(state, { id: ids.b, ...input.b }, o);
      let orbit = o;
      for (const move of input.moves) {
        const moved = gestureMove(state, { id: ids[move.finger], ...move.to }, orbit, l);
        state = moved.state;
        orbit = moved.orbit;
        seen.push(orbit);
      }
      if (input.lift !== null) {
        state = gestureUp(state, ids[input.lift]);
        expect(state.kind).toBe('orbit');
      }
      return seen;
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Viewer camera orbit', () => {
  // Feature: exercise-page-3d-coach, Property 2: Every camera input keeps the orbit within limits
  // **Validates: Requirements 6.1, 6.2, 6.3, 7.6, 7.8, 7.9**
  it('every camera input keeps the orbit within limits', () => {
    fc.assert(
      fc.property(orbitArb, limitsArb, fc.array(inputArb, { minLength: 1, maxLength: 20 }), (start, limits, inputs) => {
        let orbit = start;
        for (const input of inputs) {
          for (const next of applyInput(orbit, input, limits)) {
            expectWithinLimits(next, limits);
            orbit = next;
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  // Feature: exercise-page-3d-coach, Property 3: Button steps are exact and reversible inside the limits
  // **Validates: Requirements 7.5, 7.6, 7.8, 7.9**
  it('button steps are exact and reversible inside the limits', () => {
    fc.assert(
      fc.property(
        limitsArb.chain((limits) => fc.tuple(fc.constant(limits), orbitWithinArb(limits))),
        ([limits, start]) => {
          const { azimuthDeg, elevationDeg, distance } = start;

          // Rotate left adds 45° and Rotate right subtracts 45°, modulo 360°, with no limit.
          const left = buttonStep(start, 'rotateLeft', limits);
          const right = buttonStep(start, 'rotateRight', limits);
          expect(angleGap(left.azimuthDeg, azimuthDeg + rotateStepDeg)).toBeLessThan(angleTolerance);
          expect(angleGap(right.azimuthDeg, azimuthDeg - rotateStepDeg)).toBeLessThan(angleTolerance);
          expect(angleGap(buttonStep(left, 'rotateRight', limits).azimuthDeg, azimuthDeg)).toBeLessThan(
            angleTolerance,
          );
          for (const rotated of [left, right]) {
            expect(rotated.elevationDeg).toBe(elevationDeg);
            expect(rotated.distance).toBe(distance);
          }

          // Tilt up adds and Tilt down subtracts 15° of Elevation, stopping at 0° and 75°.
          const up = buttonStep(start, 'tiltUp', limits);
          const down = buttonStep(start, 'tiltDown', limits);
          expect(up.elevationDeg).toBeCloseTo(Math.min(elevationDeg + tiltStepDeg, limits.maxElevationDeg), 9);
          expect(down.elevationDeg).toBeCloseTo(Math.max(elevationDeg - tiltStepDeg, limits.minElevationDeg), 9);
          if (elevationDeg + tiltStepDeg <= limits.maxElevationDeg) {
            expect(buttonStep(up, 'tiltDown', limits).elevationDeg).toBeCloseTo(elevationDeg, 9);
          }
          for (const tilted of [up, down]) {
            expect(tilted.azimuthDeg).toBe(azimuthDeg);
            expect(tilted.distance).toBe(distance);
          }

          // Zoom in multiplies the Camera_Distance by 0.8 and Zoom out divides it by 0.8,
          // stopping at the distance limits.
          const zoomedIn = buttonStep(start, 'zoomIn', limits);
          const zoomedOut = buttonStep(start, 'zoomOut', limits);
          expectRelativelyClose(zoomedIn.distance, Math.max(distance * 0.8, limits.minDistance));
          expectRelativelyClose(zoomedOut.distance, Math.min(distance / 0.8, limits.maxDistance));
          for (const zoomed of [zoomedIn, zoomedOut]) {
            expect(zoomed.azimuthDeg).toBe(azimuthDeg);
            expect(zoomed.elevationDeg).toBe(elevationDeg);
          }
          // Zoom in followed by Zoom out returns the same distance when neither step was clamped.
          const back = buttonStep(zoomedIn, 'zoomOut', limits);
          if (distance * 0.8 > limits.minDistance && zoomedIn.distance / 0.8 < limits.maxDistance) {
            expectRelativelyClose(back.distance, distance);
          }

          // Every step stays inside the limits.
          for (const step of buttonSteps) {
            expectWithinLimits(buttonStep(start, step, limits), limits);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('the Side Camera_Preset looks at the Coach’s left side', () => {
    // The Coach faces +Z, so its left side is +X.
    const side = cameraPosition(
      { azimuthDeg: presetAzimuthDeg.side, elevationDeg: presetElevationDeg, distance: 3 },
      origin,
    );
    expect(side.x).toBeGreaterThan(2.9);
    expect(Math.abs(side.z)).toBeLessThan(1e-9);

    const front = cameraPosition({ azimuthDeg: presetAzimuthDeg.front, elevationDeg: 0, distance: 3 }, origin);
    expect(front.z).toBeCloseTo(3, 9);
    const back = cameraPosition({ azimuthDeg: presetAzimuthDeg.back, elevationDeg: 0, distance: 3 }, origin);
    expect(back.z).toBeCloseTo(-3, 9);
  });

  it('Rotate left from the Front view moves the camera towards the Side view', () => {
    const front: Orbit = { azimuthDeg: presetAzimuthDeg.front, elevationDeg: presetElevationDeg, distance: 3 };
    const left = buttonStep(front, 'rotateLeft', exampleLimits);
    expect(left.azimuthDeg).toBeCloseTo(45, 9);
    expect(angleGap(left.azimuthDeg, presetAzimuthDeg.side)).toBeLessThan(
      angleGap(front.azimuthDeg, presetAzimuthDeg.side),
    );
    // The camera moves towards +X, the Coach's left side.
    expect(cameraPosition(left, origin).x).toBeGreaterThan(cameraPosition(front, origin).x);
    // One more Rotate left step reaches the Side view, two more the Back view.
    const toSide = buttonStep(left, 'rotateLeft', exampleLimits);
    expect(angleGap(toSide.azimuthDeg, presetAzimuthDeg.side)).toBeLessThan(angleTolerance);
    const toBack = buttonStep(buttonStep(toSide, 'rotateLeft', exampleLimits), 'rotateLeft', exampleLimits);
    expect(angleGap(toBack.azimuthDeg, presetAzimuthDeg.back)).toBeLessThan(angleTolerance);
  });

  it('Tilt up raises the camera and Tilt down lowers it', () => {
    const start: Orbit = { azimuthDeg: 0, elevationDeg: 30, distance: 3 };
    const up = buttonStep(start, 'tiltUp', exampleLimits);
    const down = buttonStep(start, 'tiltDown', exampleLimits);
    expect(up.elevationDeg).toBe(45);
    expect(down.elevationDeg).toBe(15);
    expect(cameraPosition(up, origin).y).toBeGreaterThan(cameraPosition(start, origin).y);
    expect(cameraPosition(down, origin).y).toBeLessThan(cameraPosition(start, origin).y);
    // Near the top the step stops at 75°.
    expect(buttonStep({ ...start, elevationDeg: 70 }, 'tiltUp', exampleLimits).elevationDeg).toBe(75);
    expect(buttonStep({ ...start, elevationDeg: 5 }, 'tiltDown', exampleLimits).elevationDeg).toBe(0);
  });

  it('Zoom out undoes Zoom in', () => {
    const start: Orbit = { azimuthDeg: 0, elevationDeg: 5, distance: 3 };
    const zoomedIn = buttonStep(start, 'zoomIn', exampleLimits);
    expect(zoomedIn.distance).toBeCloseTo(2.4, 9);
    expect(buttonStep(zoomedIn, 'zoomOut', exampleLimits).distance).toBeCloseTo(3, 9);
    // At the smallest Camera_Distance Zoom in stops at the limit.
    const nearest: Orbit = { ...start, distance: exampleLimits.minDistance };
    expect(buttonStep(nearest, 'zoomIn', exampleLimits).distance).toBe(exampleLimits.minDistance);
  });

  it('an Azimuth of 360° is the Front view again', () => {
    expect(normalizeAzimuth(360)).toBe(0);
    const full = clampOrbit({ azimuthDeg: 360, elevationDeg: 5, distance: 3 }, exampleLimits);
    expect(full.azimuthDeg).toBe(presetAzimuthDeg.front);
    const frontPos = cameraPosition({ azimuthDeg: 0, elevationDeg: 5, distance: 3 }, origin);
    const fullPos = cameraPosition({ azimuthDeg: 360, elevationDeg: 5, distance: 3 }, origin);
    expect(fullPos.x).toBeCloseTo(frontPos.x, 9);
    expect(fullPos.y).toBeCloseTo(frontPos.y, 9);
    expect(fullPos.z).toBeCloseTo(frontPos.z, 9);
    // Eight Rotate left steps make a full turn.
    let orbit: Orbit = { azimuthDeg: 0, elevationDeg: 5, distance: 3 };
    for (let i = 0; i < 8; i += 1) orbit = buttonStep(orbit, 'rotateLeft', exampleLimits);
    expect(angleGap(orbit.azimuthDeg, 0)).toBeLessThan(angleTolerance);
  });

  it('a camera tween from 350° to 10° takes the shorter way round', () => {
    const from: Orbit = { azimuthDeg: 350, elevationDeg: 5, distance: 3 };
    const to: Orbit = { azimuthDeg: 10, elevationDeg: 5, distance: 3 };
    const tween = startTween(from, to, 1000, 400);
    // Halfway through, the camera passes the Front view, not the Back view.
    expect(angleGap(sampleTween(tween, 1200).orbit.azimuthDeg, 0)).toBeLessThan(angleTolerance);
    // Every sample stays on the 20° arc through 0°.
    for (let now = 1000; now <= 1400; now += 20) {
      const { orbit } = sampleTween(tween, now);
      expect(angleGap(orbit.azimuthDeg, 0)).toBeLessThanOrEqual(10 + angleTolerance);
    }
    const end = sampleTween(tween, 1400);
    expect(end.done).toBe(true);
    expect(end.orbit).toEqual(to);
  });
});

// ---------------------------------------------------------------------------
// Button steps (design: Camera_Controls table)
// ---------------------------------------------------------------------------

const rotateStepDeg = 45;
const tiltStepDeg = 15;

const buttonSteps = ['rotateLeft', 'rotateRight', 'tiltUp', 'tiltDown', 'zoomIn', 'zoomOut'] as const;
type ButtonStep = (typeof buttonSteps)[number];

/** One activation of a Rotate, Tilt or Zoom button, as the Viewer controller applies it. */
function buttonStep(o: Orbit, step: ButtonStep, l: OrbitLimits): Orbit {
  switch (step) {
    case 'rotateLeft':
      return rotateBy(o, rotateStepDeg, l);
    case 'rotateRight':
      return rotateBy(o, -rotateStepDeg, l);
    case 'tiltUp':
      return tiltBy(o, tiltStepDeg, l);
    case 'tiltDown':
      return tiltBy(o, -tiltStepDeg, l);
    case 'zoomIn':
      return zoomBy(o, zoomStepFactor, l);
    case 'zoomOut':
      return zoomBy(o, 1 / zoomStepFactor, l);
  }
}

/** Any orbit inside the limits, with the limit values themselves drawn often. */
function orbitWithinArb(l: OrbitLimits): fc.Arbitrary<Orbit> {
  return fc.record({
    azimuthDeg: fc.oneof(fc.constantFrom(0, 45, 90, 180, 315), inRange(0, 360)).map(normalizeAzimuth),
    elevationDeg: fc.oneof(fc.constantFrom(0, 5, 60, 70, 75), inRange(0, 75)),
    distance: fc.oneof(fc.constantFrom(l.minDistance, l.maxDistance), inRange(l.minDistance, l.maxDistance)),
  });
}

function expectRelativelyClose(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(expected)));
}

const origin = { x: 0, y: 0, z: 0 } as const;

const exampleLimits: OrbitLimits = { minElevationDeg: 0, maxElevationDeg: 75, minDistance: 1.3, maxDistance: 6.1 };
