import fc from 'fast-check';
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import type { Box3Value, Vec3 } from '../../src/viewer/logic/geometry-types';
import {
  clearanceM,
  computeFraming,
  presetMarginShare,
  type FramingInput,
} from '../../src/viewer/logic/framing';
import {
  cameraPosition,
  presetAzimuthDeg,
  presetElevationDeg,
  type CameraPreset,
  type Orbit,
  type OrbitLimits,
} from '../../src/viewer/logic/orbit';

// ---------------------------------------------------------------------------
// Shared generators (Properties 4, 5 and 6)
// ---------------------------------------------------------------------------

/** Vertical field of view and near plane the Viewer's camera uses. */
const fovDeg = 40;
const near = 0.05;

/** Coach bounds: a standing box and a motion box that contains it. */
interface CoachBounds {
  readonly standingBounds: Box3Value;
  readonly motionBounds: Box3Value;
}

const length = (min: number, max: number): fc.Arbitrary<number> => fc.double({ min, max, noNaN: true });

/**
 * A standing box 0.5–3 m tall, 0.1–1.5 m wide and deep, centred near the
 * origin with the feet at y = 0, and a motion box that extends it by 0–1 m on
 * each side independently.
 */
const coachBoundsArb: fc.Arbitrary<CoachBounds> = fc
  .record({
    height: length(0.5, 3),
    width: length(0.1, 1.5),
    depth: length(0.1, 1.5),
    centreX: length(-0.2, 0.2),
    centreZ: length(-0.2, 0.2),
    grow: fc.record({
      minX: length(0, 1),
      maxX: length(0, 1),
      minY: length(0, 1),
      maxY: length(0, 1),
      minZ: length(0, 1),
      maxZ: length(0, 1),
    }),
  })
  .map(({ height, width, depth, centreX, centreZ, grow }) => {
    const standingBounds: Box3Value = {
      min: { x: centreX - width / 2, y: 0, z: centreZ - depth / 2 },
      max: { x: centreX + width / 2, y: height, z: centreZ + depth / 2 },
    };
    const motionBounds: Box3Value = {
      min: {
        x: standingBounds.min.x - grow.minX,
        y: standingBounds.min.y - grow.minY,
        z: standingBounds.min.z - grow.minZ,
      },
      max: {
        x: standingBounds.max.x + grow.maxX,
        y: standingBounds.max.y + grow.maxY,
        z: standingBounds.max.z + grow.maxZ,
      },
    };
    return { standingBounds, motionBounds };
  });

/** Viewer_Area width / height, from a tall phone to a wide laptop. */
const aspectArb: fc.Arbitrary<number> = length(0.4, 3);

/** A complete input for `computeFraming`. */
const framingInputArb: fc.Arbitrary<FramingInput> = fc
  .record({ bounds: coachBoundsArb, aspect: aspectArb })
  .map(({ bounds, aspect }) => ({ ...bounds, aspect, fovDeg, near }));

/**
 * An orbit inside the given limits: any Azimuth in [0°, 360°), any Elevation
 * in [0°, 75°] and any distance in [minDistance, maxDistance], with the limit
 * values themselves generated often.
 */
function orbitWithinArb(limits: OrbitLimits): fc.Arbitrary<Orbit> {
  const share = fc.oneof(fc.constant(0), fc.constant(1), length(0, 1));
  return fc.record({
    azimuthDeg: fc.double({ min: 0, max: 360, maxExcluded: true, noNaN: true }),
    elevationDeg: fc.oneof(
      fc.constant(limits.minElevationDeg),
      fc.constant(limits.maxElevationDeg),
      length(limits.minElevationDeg, limits.maxElevationDeg),
    ),
    distance: share.map((s) => limits.minDistance + s * (limits.maxDistance - limits.minDistance)),
  });
}

/** A framing input together with an orbit inside the limits of its Framing. */
const framedOrbitArb = framingInputArb.chain((input) => {
  const framing = computeFraming(input);
  return orbitWithinArb(framing.limits).map((orbit) => ({ input, framing, orbit }));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function enlarge(box: Box3Value, by: number): Box3Value {
  return {
    min: { x: box.min.x - by, y: box.min.y - by, z: box.min.z - by },
    max: { x: box.max.x + by, y: box.max.y + by, z: box.max.z + by },
  };
}

/** True when `p` is inside or on the surface of `box`. */
function isInside(p: Vec3, box: Box3Value): boolean {
  return (
    p.x >= box.min.x && p.x <= box.max.x &&
    p.y >= box.min.y && p.y <= box.max.y &&
    p.z >= box.min.z && p.z <= box.max.z
  );
}

function corners(box: Box3Value): readonly Vec3[] {
  const result: Vec3[] = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        result.push({ x, y, z });
      }
    }
  }
  return result;
}

const cameraPresets: readonly CameraPreset[] = ['front', 'side', 'back'];

/** Far plane of the Viewer's camera (design: Scene3D `camera.far`). */
const far = 60;

/**
 * Independent oracle: a Three.js `PerspectiveCamera` placed at `orbit` around
 * `target` and looking at it. Returns true when every point lies in front of
 * the camera, between the near and far planes, and inside the view with at
 * least `presetMarginShare` of the view height and width free at every edge.
 */
function framesWithMargins(
  points: readonly Vec3[],
  orbit: Orbit,
  target: Vec3,
  aspect: number,
): boolean {
  const camera = new PerspectiveCamera(fovDeg, aspect, near, far);
  const eye = cameraPosition(orbit, target);
  camera.position.set(eye.x, eye.y, eye.z);
  camera.lookAt(target.x, target.y, target.z);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  // A share s of the view height is 2·s in NDC units, which span −1 to 1.
  const limit = 1 - 2 * presetMarginShare;
  return points.every((p) => {
    const inCamera = new Vector3(p.x, p.y, p.z).applyMatrix4(camera.matrixWorldInverse);
    if (inCamera.z >= 0) return false; // behind the camera (it looks down −Z)
    const ndc = new Vector3(p.x, p.y, p.z).project(camera);
    return Math.abs(ndc.x) <= limit && Math.abs(ndc.y) <= limit && ndc.z >= -1 && ndc.z <= 1;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Viewer framing', () => {
  // Feature: exercise-page-3d-coach, Property 4: The camera never enters the Coach's enlarged bounding box
  // **Validates: Requirements 6.5**
  it("the camera never enters the Coach's motion bounds enlarged by the clearance", () => {
    fc.assert(
      fc.property(framedOrbitArb, ({ input, framing, orbit }) => {
        const camera = cameraPosition(orbit, framing.target);
        const enlarged = enlarge(input.motionBounds, clearanceM);
        expect(isInside(camera, enlarged)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: exercise-page-3d-coach, Property 5: Camera_Presets frame the full body with margins
  // **Validates: Requirements 7.1, 7.2**
  it("every Camera_Preset shows the Coach's whole motion bounds with 5 % margins", () => {
    // Requirement 7.1: every Camera_Preset has an Elevation of 10° or less.
    expect(presetElevationDeg).toBeLessThanOrEqual(10);
    expect(presetElevationDeg).toBeGreaterThanOrEqual(0);

    let fittedChecks = 0;
    fc.assert(
      fc.property(framingInputArb, (input) => {
        const framing = computeFraming(input);
        const points = corners(input.motionBounds);
        for (const preset of cameraPresets) {
          const orbit: Orbit = {
            azimuthDeg: presetAzimuthDeg[preset],
            elevationDeg: presetElevationDeg,
            distance: framing.presetDistance[preset],
          };
          const framed = framesWithMargins(points, orbit, framing.target, input.aspect);
          // The design allows one exception: a Coach that does not fit even at
          // maxDistance gets maxDistance (the fitted distance was clamped).
          const clamped = orbit.distance === framing.limits.maxDistance && !framed;
          if (clamped) continue;
          fittedChecks += 1;
          expect(framed, `${preset} preset at ${orbit.distance} m`).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
    // Guard against a vacuous pass: many generated Coaches must fit unclamped.
    expect(fittedChecks).toBeGreaterThanOrEqual(100);
  });

  // Feature: exercise-page-3d-coach, Property 6: Framing limits are ordered, centred and keep the Coach large enough
  // **Validates: Requirements 6.4, 6.6**
  it('the Camera_Distance limits are ordered, the Orbit_Target stays centred and the Coach stays large enough', () => {
    let heightChecks = 0;
    fc.assert(
      fc.property(framedOrbitArb, ({ input, framing, orbit }) => {
        const { limits, presetDistance, target } = framing;

        // Ordered: minDistance ≤ every preset distance ≤ maxDistance.
        expect(limits.minDistance).toBeLessThanOrEqual(limits.maxDistance);
        for (const preset of cameraPresets) {
          expect(presetDistance[preset]).toBeGreaterThanOrEqual(limits.minDistance);
          expect(presetDistance[preset]).toBeLessThanOrEqual(limits.maxDistance);
        }

        // Requirement 6.4: the Orbit_Target projects to the centre of the view
        // at every allowed orbit (independent Three.js camera as the oracle).
        const centre = projectWithThree(target, orbit, target, input.aspect);
        expect(Math.abs(centre.x)).toBeLessThan(1e-6);
        expect(Math.abs(centre.y)).toBeLessThan(1e-6);

        // Requirement 6.6: at maxDistance and Elevation 0° the standing height
        // spans at least 35 % of the view height, unless maxDistance had to be
        // raised to minDistance (a Coach wider than its height-based limit).
        if (limits.maxDistance > limits.minDistance) {
          heightChecks += 1;
          const farthest: Orbit = {
            azimuthDeg: orbit.azimuthDeg,
            elevationDeg: 0,
            distance: limits.maxDistance,
          };
          const { standingBounds } = input;
          const feet = projectWithThree({ ...target, y: standingBounds.min.y }, farthest, target, input.aspect);
          const head = projectWithThree({ ...target, y: standingBounds.max.y }, farthest, target, input.aspect);
          // NDC y spans 2 units for the full view height.
          const heightShare = (head.y - feet.y) / 2;
          expect(heightShare).toBeGreaterThanOrEqual(0.35);
        }
      }),
      { numRuns: 200 },
    );
    // Guard against a vacuous pass: many generated Coaches keep the height-based limit.
    expect(heightChecks).toBeGreaterThanOrEqual(50);
  });

  it('a 1.78 m Coach gets a Front distance between 2 and 4 m', () => {
    // Approximate bounds of the delivered Coach: standing upright, and over
    // the Grave Rise Demo_Clip reaching forward with the arms and back with the hips.
    const framing = computeFraming({
      standingBounds: { min: { x: -0.3, y: 0, z: -0.15 }, max: { x: 0.3, y: 1.78, z: 0.15 } },
      motionBounds: { min: { x: -0.35, y: 0, z: -0.45 }, max: { x: 0.35, y: 1.8, z: 0.6 } },
      aspect: 1,
      fovDeg,
      near,
    });
    expect(framing.target.y).toBeCloseTo(0.89, 6);
    expect(framing.presetDistance.front).toBeGreaterThanOrEqual(2);
    expect(framing.presetDistance.front).toBeLessThanOrEqual(4);
  });

  it('a Coach wider than its height-based limit gets maxDistance = minDistance', () => {
    // 0.5 m tall but 3 m wide and deep: the height-based limit (≈ 1.7 m) is
    // closer than the clearance around the Coach allows.
    const bounds: Box3Value = { min: { x: -1.5, y: 0, z: -1.5 }, max: { x: 1.5, y: 0.5, z: 1.5 } };
    const framing = computeFraming({ standingBounds: bounds, motionBounds: bounds, aspect: 1, fovDeg, near });
    expect(framing.limits.maxDistance).toBe(framing.limits.minDistance);
    for (const preset of cameraPresets) {
      expect(framing.presetDistance[preset]).toBe(framing.limits.minDistance);
    }
  });
});

/** Projects `point` to NDC with a Three.js `PerspectiveCamera` at `orbit` looking at `target`. */
function projectWithThree(point: Vec3, orbit: Orbit, target: Vec3, aspect: number): { x: number; y: number } {
  const camera = new PerspectiveCamera(fovDeg, aspect, near, far);
  const eye = cameraPosition(orbit, target);
  camera.position.set(eye.x, eye.y, eye.z);
  camera.lookAt(target.x, target.y, target.z);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const ndc = new Vector3(point.x, point.y, point.z).project(camera);
  return { x: ndc.x, y: ndc.y };
}
