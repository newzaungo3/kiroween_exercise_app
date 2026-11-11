/**
 * Plain value types shared by the pure Viewer logic. They mirror the Three.js
 * `Vector3` and `Box3` shapes without importing Three.js, so the logic stays
 * testable in the `node` environment.
 */

/** A point or direction in scene space, in metres. +Y is up; the Coach faces +Z. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** An axis-aligned bounding box in scene space, in metres. */
export interface Box3Value {
  readonly min: Vec3;
  readonly max: Vec3;
}
