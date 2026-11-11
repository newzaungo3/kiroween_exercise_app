/**
 * Camera state and limits for the Viewer.
 *
 * The camera orbits the Orbit_Target. Its position is given by the Azimuth
 * (horizontal angle, 0° is the Front Camera_Preset), the Elevation (angle above
 * the horizontal plane through the Orbit_Target) and the Camera_Distance.
 * Every camera input (gestures, Camera_Controls, Camera_Presets) goes through
 * `clampOrbit`, so the limits of Requirement 6 hold for every input path.
 *
 * Pure module: no React, Three.js, DOM or storage imports.
 */

import type { Vec3 } from './geometry-types';

export type CameraPreset = 'front' | 'side' | 'back';

export interface Orbit {
  /** Azimuth in degrees, in [0, 360) once clamped. 0 is the Front view, 90 the Coach's left side. */
  readonly azimuthDeg: number;
  /** Elevation in degrees above the horizontal plane through the Orbit_Target. */
  readonly elevationDeg: number;
  /** Camera_Distance to the Orbit_Target, in metres. */
  readonly distance: number;
}

export interface OrbitLimits {
  readonly minElevationDeg: 0;
  readonly maxElevationDeg: 75;
  /** Smallest Camera_Distance; `minDistance <= maxDistance`. */
  readonly minDistance: number;
  /** Largest Camera_Distance. */
  readonly maxDistance: number;
}

/** Azimuth of each Camera_Preset: Front 0°, Side 90° (the Coach's left), Back 180°. */
export const presetAzimuthDeg: { readonly [P in CameraPreset]: number } = {
  front: 0,
  side: 90,
  back: 180,
};

/** Elevation of every Camera_Preset (Requirement 7.1 allows 10° or less). */
export const presetElevationDeg = 5;

const fullTurnDeg = 360;
const halfTurnDeg = 180;
const degToRad = Math.PI / halfTurnDeg;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Maps any finite angle in degrees into [0, 360). A non-finite angle becomes 0. */
export function normalizeAzimuth(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  // `%` is exact. Adding a full turn only to a negative remainder keeps an angle
  // already in [0, 360) bit-for-bit unchanged, so clampOrbit is idempotent.
  const remainder = deg % fullTurnDeg;
  const wrapped = remainder < 0 ? remainder + fullTurnDeg : remainder;
  // Rounding can land exactly on 360 for tiny negative inputs, and -0 should read as 0.
  return wrapped >= fullTurnDeg || wrapped === 0 ? 0 : wrapped;
}

/** Normalises the Azimuth and clamps the Elevation and Camera_Distance into the limits. */
export function clampOrbit(o: Orbit, limits: OrbitLimits): Orbit {
  return {
    azimuthDeg: normalizeAzimuth(o.azimuthDeg),
    elevationDeg: clamp(o.elevationDeg, limits.minElevationDeg, limits.maxElevationDeg),
    distance: clamp(o.distance, limits.minDistance, limits.maxDistance),
  };
}

/** Changes the Azimuth by `deltaDeg` with no limit (positive is Rotate left, towards the Side view). */
export function rotateBy(o: Orbit, deltaDeg: number, l: OrbitLimits): Orbit {
  return clampOrbit({ ...o, azimuthDeg: o.azimuthDeg + deltaDeg }, l);
}

/** Changes the Elevation by `deltaDeg`, stopping at the limits (positive is Tilt up). */
export function tiltBy(o: Orbit, deltaDeg: number, l: OrbitLimits): Orbit {
  return clampOrbit({ ...o, elevationDeg: o.elevationDeg + deltaDeg }, l);
}

/** Multiplies the Camera_Distance by `factor`, stopping at the limits (below 1 zooms in). */
export function zoomBy(o: Orbit, factor: number, l: OrbitLimits): Orbit {
  return clampOrbit({ ...o, distance: o.distance * factor }, l);
}

/**
 * The camera position for an orbit around `target`. Azimuth 0 puts the camera
 * on +Z, in front of a Coach facing glTF forward (+Z); Azimuth 90 puts it on
 * +X, the Coach's left side.
 */
export function cameraPosition(o: Orbit, target: Vec3): Vec3 {
  const az = o.azimuthDeg * degToRad;
  const el = o.elevationDeg * degToRad;
  const horizontal = o.distance * Math.cos(el);
  return {
    x: target.x + horizontal * Math.sin(az),
    y: target.y + o.distance * Math.sin(el),
    z: target.z + horizontal * Math.cos(az),
  };
}

/** An animated camera move from one orbit to another. Times are in milliseconds. */
export interface CameraTween {
  readonly from: Orbit;
  readonly to: Orbit;
  readonly startAt: number;
  readonly durationMs: number;
}

export function startTween(from: Orbit, to: Orbit, now: number, durationMs: number): CameraTween {
  return { from, to, startAt: now, durationMs };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Signed Azimuth change from `fromDeg` to `toDeg` the shorter way round, in (-180, 180]. */
function shortestAzimuthDelta(fromDeg: number, toDeg: number): number {
  const delta = normalizeAzimuth(toDeg - fromDeg);
  return delta > halfTurnDeg ? delta - fullTurnDeg : delta;
}

/**
 * The orbit a tween shows at `now`, eased in and out (cubic). The Azimuth takes
 * the shorter way round. A tween with a duration of 0 or less lands on `to` at
 * once, and from the end time on the result is exactly `to` with `done` true.
 */
export function sampleTween(tw: CameraTween, now: number): { readonly orbit: Orbit; readonly done: boolean } {
  const elapsed = now - tw.startAt;
  if (tw.durationMs <= 0 || elapsed >= tw.durationMs) {
    return { orbit: tw.to, done: true };
  }
  const e = easeInOutCubic(clamp(elapsed / tw.durationMs, 0, 1));
  const { from, to } = tw;
  return {
    orbit: {
      azimuthDeg: normalizeAzimuth(from.azimuthDeg + shortestAzimuthDelta(from.azimuthDeg, to.azimuthDeg) * e),
      elevationDeg: from.elevationDeg + (to.elevationDeg - from.elevationDeg) * e,
      distance: from.distance + (to.distance - from.distance) * e,
    },
    done: false,
  };
}
