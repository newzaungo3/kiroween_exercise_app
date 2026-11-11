/**
 * Pointer and wheel maths for the Viewer camera.
 *
 * One finger, a mouse or a pen orbits the camera; two fingers pinch to zoom;
 * the mouse wheel or a trackpad zooms. Every result goes through `orbit.ts`,
 * so gestures keep the same limits as the Camera_Controls and Camera_Presets.
 * Directions match the buttons: a drag to the right turns the camera like
 * Rotate right, and a drag downwards raises it like Tilt up.
 *
 * Gestures never animate and leave no motion behind once they end
 * (Requirement 11.3): the orbit changes only inside `gestureMove` and `wheelZoom`.
 *
 * Pure module: no React, Three.js, DOM or storage imports.
 */

import { clampOrbit, rotateBy, tiltBy, zoomBy, type Orbit, type OrbitLimits } from './orbit';

/** One pointer position in CSS pixels, as reported by a pointer event. */
export interface PointerSample {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

export type GestureState =
  | { readonly kind: 'idle' }
  /** One pointer down: drags orbit the camera. `pointer` is the last sample seen. */
  | { readonly kind: 'orbit'; readonly pointer: PointerSample }
  /**
   * Two pointers down: the gap between them sets the Camera_Distance.
   * `startGap` and `startDistance` are the gap and distance when the pinch began.
   */
  | {
      readonly kind: 'pinch';
      readonly a: PointerSample;
      readonly b: PointerSample;
      readonly startGap: number;
      readonly startDistance: number;
    };

export const idleGesture: GestureState = { kind: 'idle' };

/** Camera turn per pixel of drag, in degrees. */
export const degreesPerPixel = { azimuth: 0.4, elevation: 0.3 } as const;

/** Pixels per wheel line (`deltaMode` 1). */
export const wheelLinePx = 16;

/** Exponent per wheel pixel: the Camera_Distance is multiplied by `exp(px · wheelZoomPerPx)`. */
export const wheelZoomPerPx = 0.002;

function gap(a: PointerSample, b: PointerSample): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** A pointer went down on the Viewer_Area. */
export function gestureDown(s: GestureState, p: PointerSample, o: Orbit): GestureState {
  switch (s.kind) {
    case 'idle':
      return { kind: 'orbit', pointer: p };
    case 'orbit':
      if (s.pointer.id === p.id) return { kind: 'orbit', pointer: p };
      return { kind: 'pinch', a: s.pointer, b: p, startGap: gap(s.pointer, p), startDistance: o.distance };
    case 'pinch':
      // A third pointer is ignored; the pinch continues with the first two.
      return s;
  }
}

/**
 * A pointer moved. Returns the new gesture state and the new orbit, always
 * within the limits.
 *
 * - Orbit: Δazimuth = −dx · 0.4°, Δelevation = +dy · 0.3° (dx, dy in pixels since the last sample).
 * - Pinch: distance = startDistance · startGap / currentGap, so pinching apart zooms in.
 */
export function gestureMove(
  s: GestureState,
  p: PointerSample,
  o: Orbit,
  l: OrbitLimits,
): { readonly state: GestureState; readonly orbit: Orbit } {
  switch (s.kind) {
    case 'idle':
      return { state: s, orbit: clampOrbit(o, l) };
    case 'orbit': {
      if (s.pointer.id !== p.id) return { state: s, orbit: clampOrbit(o, l) };
      const dx = p.x - s.pointer.x;
      const dy = p.y - s.pointer.y;
      const turned = rotateBy(o, -dx * degreesPerPixel.azimuth, l);
      return { state: { kind: 'orbit', pointer: p }, orbit: tiltBy(turned, dy * degreesPerPixel.elevation, l) };
    }
    case 'pinch': {
      if (p.id !== s.a.id && p.id !== s.b.id) return { state: s, orbit: clampOrbit(o, l) };
      const a = p.id === s.a.id ? p : s.a;
      const b = p.id === s.b.id ? p : s.b;
      const currentGap = gap(a, b);
      if (!(s.startGap > 0)) {
        // The pinch began with both fingers on one spot: anchor it now instead.
        return { state: { kind: 'pinch', a, b, startGap: currentGap, startDistance: o.distance }, orbit: clampOrbit(o, l) };
      }
      const state: GestureState = { ...s, a, b };
      if (!(currentGap > 0)) return { state, orbit: clampOrbit(o, l) };
      const distance = (s.startDistance * s.startGap) / currentGap;
      if (!Number.isFinite(distance)) return { state, orbit: clampOrbit(o, l) };
      return { state, orbit: clampOrbit({ ...o, distance }, l) };
    }
  }
}

/**
 * A pointer went up or was cancelled. Lifting one of two fingers continues as
 * an orbit anchored at the remaining finger's last position, so the camera
 * does not jump.
 */
export function gestureUp(s: GestureState, pointerId: number): GestureState {
  switch (s.kind) {
    case 'idle':
      return s;
    case 'orbit':
      return s.pointer.id === pointerId ? idleGesture : s;
    case 'pinch':
      if (s.a.id === pointerId) return { kind: 'orbit', pointer: s.b };
      if (s.b.id === pointerId) return { kind: 'orbit', pointer: s.a };
      return s;
  }
}

/**
 * Zooms for a wheel or trackpad event over the Viewer_Area. `deltaMode` follows
 * `WheelEvent`: 0 pixels, 1 lines (16 px each), 2 pages (`areaHeightPx` each).
 * Scrolling down (positive `deltaY`) zooms out. A ctrl+wheel trackpad pinch
 * uses the same path.
 */
export function wheelZoom(
  o: Orbit,
  deltaY: number,
  deltaMode: 0 | 1 | 2,
  areaHeightPx: number,
  l: OrbitLimits,
): Orbit {
  const px = deltaMode === 1 ? deltaY * wheelLinePx : deltaMode === 2 ? deltaY * areaHeightPx : deltaY;
  if (!Number.isFinite(px) || px === 0) return clampOrbit(o, l);
  const factor = Math.exp(px * wheelZoomPerPx);
  if (!Number.isFinite(factor)) return clampOrbit({ ...o, distance: l.maxDistance }, l);
  if (factor === 0) return clampOrbit({ ...o, distance: l.minDistance }, l);
  return zoomBy(o, factor, l);
}
