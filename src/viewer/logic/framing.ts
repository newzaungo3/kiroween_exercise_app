/**
 * Camera framing derived from the Coach_Asset's bounds.
 *
 * `computeFraming` turns the Coach's standing (bind pose) bounds and its
 * bounds over the whole Demo_Clip into the Orbit_Target, the Camera_Distance
 * limits and the distance of each Camera_Preset. Nothing here knows the
 * Coach's real size, so a CC0_Fallback asset of another size frames correctly
 * with no code change (Requirement 15.5).
 *
 * Pure module: no React, Three.js, DOM or storage imports.
 */

import type { Box3Value, Vec3 } from './geometry-types';
import {
  cameraPosition,
  presetAzimuthDeg,
  presetElevationDeg,
  type CameraPreset,
  type Orbit,
  type OrbitLimits,
} from './orbit';

export interface FramingInput {
  /** Bounds in the bind (rest) pose; gives the standing height. */
  readonly standingBounds: Box3Value;
  /** Union of the bounds over sampled frames of the Demo_Clip. */
  readonly motionBounds: Box3Value;
  /** Viewer_Area width divided by its height. */
  readonly aspect: number;
  /** Vertical field of view in degrees. */
  readonly fovDeg: number;
  /** Camera near plane in metres. */
  readonly near: number;
}

export interface Framing {
  /** The Orbit_Target the camera always looks at. */
  readonly target: Vec3;
  readonly limits: OrbitLimits;
  /** Camera_Distance of each Camera_Preset, within the limits. */
  readonly presetDistance: { readonly [P in CameraPreset]: number };
}

/** Clearance around the motion bounds that the camera never enters (Requirement 6.5). */
export const clearanceM = 0.1;
/** Free share of the view kept at each edge at a Camera_Preset (Requirement 7.2). */
export const presetMarginShare = 0.05;
/** Smallest share of the view height the standing height spans at the largest distance, at Elevation 0°. Stricter than the 35 % of Requirement 6.6. */
export const minHeightShare = 0.4;
/** Largest Camera_Distance in metres; keeps the camera inside the gravestone ring. */
export const sceneMaxDistanceM = 7;

const minElevationDeg = 0;
const maxElevationDeg = 75;
const degToRad = Math.PI / 180;
const bisectionSteps = 40;
/** Keeps fitted presets a hair inside the margin, so an independent projection agrees despite rounding. */
const fitEpsilon = 1e-9;

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function length(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l === 0 ? { x: 0, y: 0, z: 0 } : { x: a.x / l, y: a.y / l, z: a.z / l };
}

function corners(box: Box3Value): readonly Vec3[] {
  const { min, max } = box;
  const result: Vec3[] = [];
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        result.push({ x, y, z });
      }
    }
  }
  return result;
}

function expand(box: Box3Value, by: number): Box3Value {
  return {
    min: { x: box.min.x - by, y: box.min.y - by, z: box.min.z - by },
    max: { x: box.max.x + by, y: box.max.y + by, z: box.max.z + by },
  };
}

/**
 * Projects `point` for a camera at orbit `o` around `target`, looking at
 * `target` with +Y up, like a Three.js `PerspectiveCamera` after `lookAt`.
 * `x` and `y` are normalised device coordinates (the view spans −1 to 1 on each
 * axis); `depth` is the distance in front of the camera along its view
 * direction, in metres (negative behind the camera).
 */
export function projectToNdc(
  point: Vec3,
  o: Orbit,
  target: Vec3,
  fovDeg: number,
  aspect: number,
): { x: number; y: number; depth: number } {
  const eye = cameraPosition(o, target);
  const forward = normalize(sub(target, eye));
  // The camera's right vector from the Azimuth alone; this equals forward × up
  // for every Elevation below 90°, and stays defined straight above the target.
  const az = o.azimuthDeg * degToRad;
  const right: Vec3 = { x: Math.cos(az), y: 0, z: -Math.sin(az) };
  const up = cross(right, forward);
  const rel = sub(point, eye);
  const depth = dot(rel, forward);
  const tanHalf = Math.tan((fovDeg * degToRad) / 2);
  return {
    x: dot(rel, right) / (depth * tanHalf * aspect),
    y: dot(rel, up) / (depth * tanHalf),
    depth,
  };
}

function fits(points: readonly Vec3[], o: Orbit, target: Vec3, fovDeg: number, aspect: number): boolean {
  const limit = 1 - 2 * presetMarginShare - fitEpsilon;
  return points.every((p) => {
    const ndc = projectToNdc(p, o, target, fovDeg, aspect);
    return ndc.depth > 0 && Math.abs(ndc.x) <= limit && Math.abs(ndc.y) <= limit;
  });
}

/**
 * The smallest distance in [minDistance, maxDistance] at which every corner of
 * the motion bounds fits inside the preset margins, found by bisection. If the
 * Coach does not fit even at maxDistance, the result is maxDistance.
 */
function fitPresetDistance(
  preset: CameraPreset,
  points: readonly Vec3[],
  target: Vec3,
  limits: OrbitLimits,
  fovDeg: number,
  aspect: number,
): number {
  const orbitAt = (distance: number): Orbit => ({
    azimuthDeg: presetAzimuthDeg[preset],
    elevationDeg: presetElevationDeg,
    distance,
  });
  if (fits(points, orbitAt(limits.minDistance), target, fovDeg, aspect)) return limits.minDistance;
  if (!fits(points, orbitAt(limits.maxDistance), target, fovDeg, aspect)) return limits.maxDistance;
  // Invariant: `lo` does not fit, `hi` fits.
  let lo = limits.minDistance;
  let hi = limits.maxDistance;
  for (let step = 0; step < bisectionSteps; step += 1) {
    const mid = (lo + hi) / 2;
    if (fits(points, orbitAt(mid), target, fovDeg, aspect)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Derives the Orbit_Target, the orbit limits and the Camera_Preset distances
 * from the Coach's bounds and the Viewer_Area's aspect ratio.
 *
 * - Orbit_Target: centre of the standing bounds in x and z, half the standing
 *   height above their lowest point in y.
 * - Minimum distance: farthest corner of the motion bounds enlarged by
 *   `clearanceM`, plus the near plane. Any farther camera is outside that box
 *   in every direction (Requirement 6.5).
 * - Maximum distance: the distance at which, at Elevation 0°, the standing
 *   height spans `minHeightShare` of the view height, capped at
 *   `sceneMaxDistanceM` and never below the minimum (Requirement 6.6).
 * - Preset distances: see `fitPresetDistance` (Requirement 7.2).
 */
export function computeFraming(input: FramingInput): Framing {
  const { standingBounds, motionBounds, aspect, fovDeg, near } = input;
  const standingHeight = standingBounds.max.y - standingBounds.min.y;
  const target: Vec3 = {
    x: (standingBounds.min.x + standingBounds.max.x) / 2,
    y: standingBounds.min.y + standingHeight / 2,
    z: (standingBounds.min.z + standingBounds.max.z) / 2,
  };

  const enlargedCorners = corners(expand(motionBounds, clearanceM));
  const minDistance = Math.max(...enlargedCorners.map((c) => length(sub(c, target)))) + near;

  const tanHalf = Math.tan((fovDeg * degToRad) / 2);
  const heightLimited = standingHeight / (2 * minHeightShare * tanHalf);
  const maxDistance = Math.max(Math.min(heightLimited, sceneMaxDistanceM), minDistance);

  const limits: OrbitLimits = { minElevationDeg, maxElevationDeg, minDistance, maxDistance };
  const motionCorners = corners(motionBounds);
  const fit = (p: CameraPreset): number => fitPresetDistance(p, motionCorners, target, limits, fovDeg, aspect);

  return {
    target,
    limits,
    presetDistance: { front: fit('front'), side: fit('side'), back: fit('back') },
  };
}
