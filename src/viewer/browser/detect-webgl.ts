/**
 * Browser adapter: can this browser create a WebGL2 context?
 *
 * Three.js renders with WebGL2 only, so the Viewer asks for `webgl2`. The
 * probe canvas is detached and its context is released at once, so the probe
 * does not hold one of the browser's limited WebGL contexts. No decisions
 * here: the load state machine decides what a `false` means.
 */

function createProbeCanvas(): HTMLCanvasElement {
  return document.createElement('canvas');
}

/**
 * True when a WebGL2 context can be created. False when the browser returns
 * `null` or throws. Call only in the browser (for example in an effect).
 */
export function detectWebGL2(create: () => HTMLCanvasElement = createProbeCanvas): boolean {
  try {
    const gl = create().getContext('webgl2');
    if (gl === null) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
