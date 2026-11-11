import { describe, expect, it } from 'vitest';

import {
  gestureDown,
  gestureMove,
  gestureUp,
  idleGesture,
  wheelZoom,
  type GestureState,
  type PointerSample,
} from '../../src/viewer/logic/gestures';
import { rotateBy, tiltBy, type Orbit, type OrbitLimits } from '../../src/viewer/logic/orbit';

const limits: OrbitLimits = { minElevationDeg: 0, maxElevationDeg: 75, minDistance: 1, maxDistance: 10 };
const start: Orbit = { azimuthDeg: 10, elevationDeg: 20, distance: 4 };

/** One pointer goes down at `from` and moves to `to`; returns the orbit after the move. */
function drag(o: Orbit, from: PointerSample, to: PointerSample): Orbit {
  const down = gestureDown(idleGesture, from, o);
  return gestureMove(down, to, o, limits).orbit;
}

function expectSameOrbit(actual: Orbit, expected: Orbit): void {
  expect(actual.azimuthDeg).toBeCloseTo(expected.azimuthDeg, 9);
  expect(actual.elevationDeg).toBeCloseTo(expected.elevationDeg, 9);
  expect(actual.distance).toBeCloseTo(expected.distance, 9);
}

describe('Viewer gestures', () => {
  it('dragging right turns the camera the same way as Rotate right', () => {
    // 112.5 px × 0.4 °/px = 45°, one Rotate right step.
    const dragged = drag(start, { id: 1, x: 100, y: 200 }, { id: 1, x: 212.5, y: 200 });
    expectSameOrbit(dragged, rotateBy(start, -45, limits));

    // A short drag to the right turns the same way, by less.
    const short = drag(start, { id: 1, x: 100, y: 200 }, { id: 1, x: 110, y: 200 });
    expect(short.azimuthDeg).toBeCloseTo(6, 9);
    expect(short.elevationDeg).toBe(start.elevationDeg);
  });

  it('dragging down raises the camera like Tilt up', () => {
    // 50 px × 0.3 °/px = 15°, one Tilt up step.
    const dragged = drag(start, { id: 1, x: 100, y: 200 }, { id: 1, x: 100, y: 250 });
    expectSameOrbit(dragged, tiltBy(start, 15, limits));
    expect(dragged.elevationDeg).toBeGreaterThan(start.elevationDeg);

    // Dragging far down stops at the Elevation limit, like Tilt up does.
    const far = drag(start, { id: 1, x: 100, y: 0 }, { id: 1, x: 100, y: 1000 });
    expect(far.elevationDeg).toBe(limits.maxElevationDeg);
  });

  it('pinching apart zooms in', () => {
    let state: GestureState = gestureDown(idleGesture, { id: 1, x: 100, y: 100 }, start);
    state = gestureDown(state, { id: 2, x: 200, y: 100 }, start);

    // The gap doubles from 100 px to 200 px, so the Camera_Distance halves.
    const apart = gestureMove(state, { id: 2, x: 300, y: 100 }, start, limits);
    expect(apart.orbit.distance).toBeCloseTo(start.distance / 2, 9);
    expect(apart.orbit.azimuthDeg).toBe(start.azimuthDeg);
    expect(apart.orbit.elevationDeg).toBe(start.elevationDeg);

    // Pinching together again zooms back out, and never past the distance limit.
    const together = gestureMove(apart.state, { id: 2, x: 101, y: 100 }, apart.orbit, limits);
    expect(together.orbit.distance).toBe(limits.maxDistance);
  });

  it('lifting one of two fingers continues as a drag', () => {
    let state: GestureState = gestureDown(idleGesture, { id: 1, x: 100, y: 100 }, start);
    state = gestureDown(state, { id: 2, x: 200, y: 100 }, start);
    state = gestureMove(state, { id: 2, x: 250, y: 120 }, start, limits).state;

    state = gestureUp(state, 1);

    // The remaining finger drags from its last position, so the camera does not jump.
    const moved = gestureMove(state, { id: 2, x: 260, y: 130 }, start, limits);
    expect(moved.orbit.azimuthDeg).toBeCloseTo(start.azimuthDeg - 10 * 0.4, 9);
    expect(moved.orbit.elevationDeg).toBeCloseTo(start.elevationDeg + 10 * 0.3, 9);
    expect(moved.orbit.distance).toBe(start.distance);

    // Lifting the last finger ends the gesture: further moves change nothing.
    const ended = gestureUp(moved.state, 2);
    const after = gestureMove(ended, { id: 2, x: 400, y: 400 }, moved.orbit, limits);
    expectSameOrbit(after.orbit, moved.orbit);
  });

  it('wheel lines and pages are normalised', () => {
    const areaHeightPx = 300;

    // 3 lines are 48 px; 1 page is the Viewer_Area height.
    expectSameOrbit(wheelZoom(start, 3, 1, areaHeightPx, limits), wheelZoom(start, 48, 0, areaHeightPx, limits));
    expectSameOrbit(wheelZoom(start, 1, 2, areaHeightPx, limits), wheelZoom(start, 300, 0, areaHeightPx, limits));

    // Scrolling down zooms out, scrolling up zooms in, by exp(px · 0.002).
    expect(wheelZoom(start, 48, 0, areaHeightPx, limits).distance).toBeCloseTo(start.distance * Math.exp(0.096), 9);
    expect(wheelZoom(start, -48, 0, areaHeightPx, limits).distance).toBeLessThan(start.distance);

    // A large wheel turn stops at the distance limits.
    expect(wheelZoom(start, 100, 2, areaHeightPx, limits).distance).toBe(limits.maxDistance);
    expect(wheelZoom(start, -100, 2, areaHeightPx, limits).distance).toBe(limits.minDistance);
  });
});
