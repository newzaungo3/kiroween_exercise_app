/**
 * The Viewer camera's lens. Scene3D builds its PerspectiveCamera from these
 * values and the Viewer island passes the same values to
 * `createViewerController`, so the framing maths and the drawn picture agree.
 *
 * Pure module: lives in `logic/` so the island can import it without pulling
 * in Three.js.
 */

/** Vertical field of view, in degrees. */
export const cameraFovDeg = 40;
/** Near plane, in metres. */
export const cameraNearM = 0.05;
/** Far plane, in metres; beyond the ground disc and the moon. */
export const cameraFarM = 60;
