/**
 * Connects the R3F camera, the Render_Loop and the visitor's gestures to the
 * Viewer controller.
 *
 * - Pointer and wheel listeners sit on the canvas element, which fills the
 *   Viewer_Area's stage. A drag keeps going outside the area until release
 *   (pointer capture). The wheel listener is not passive and calls
 *   `preventDefault()`, so the page neither scrolls nor zooms while the
 *   pointer is over the 3D scene (Requirement 6.7). `touch-action: none` on
 *   the stage is set by the Viewer island's CSS.
 * - One frame callback asks the controller for the frame
 *   (`controller.frame(performance.now())`), places the camera, poses the
 *   Demo_Clip through `poser`, and calls `invalidate()` only when the
 *   controller says another frame is needed (Requirement 10). R3F's `delta`
 *   is ignored: after an idle gap it would include the whole gap.
 * - Commands from the island (Play/Pause, Camera_Controls) reach R3F through
 *   `controller.setRequestFrame(invalidate)`.
 * - The Viewer_Area's aspect ratio is reported before each frame is computed,
 *   so the frame drawn after a resize already uses the new framing.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

import type { ViewerController } from '../logic/controller';
import type { ClipPoser } from './CoachActor';

export interface CameraRigProps {
  readonly controller: ViewerController;
  readonly poser: ClipPoser;
}

function wheelDeltaMode(mode: number): 0 | 1 | 2 {
  if (mode === 1) return 1;
  if (mode === 2) return 2;
  return 0;
}

export function CameraRig({ controller, poser }: CameraRigProps) {
  const element = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);
  const reportedAspect = useRef<number | null>(null);

  useEffect(() => {
    controller.setRequestFrame(() => {
      invalidate();
    });
    return () => {
      controller.setRequestFrame(() => {});
    };
  }, [controller, invalidate]);

  useEffect(() => {
    const sample = (event: PointerEvent) => ({ id: event.pointerId, x: event.clientX, y: event.clientY });

    const onPointerDown = (event: PointerEvent): void => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      element.setPointerCapture(event.pointerId);
      controller.pointerDown(sample(event));
    };
    const onPointerMove = (event: PointerEvent): void => {
      controller.pointerMove(sample(event));
    };
    const onPointerEnd = (event: PointerEvent): void => {
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      controller.pointerUp(event.pointerId);
    };
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      controller.wheel(event.deltaY, wheelDeltaMode(event.deltaMode), element.clientHeight);
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerEnd);
    element.addEventListener('pointercancel', onPointerEnd);
    element.addEventListener('lostpointercapture', onPointerEnd);
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerEnd);
      element.removeEventListener('pointercancel', onPointerEnd);
      element.removeEventListener('lostpointercapture', onPointerEnd);
      element.removeEventListener('wheel', onWheel);
    };
  }, [controller, element]);

  useFrame((state) => {
    const { width, height } = state.size;
    if (width > 0 && height > 0) {
      const aspect = width / height;
      if (aspect !== reportedAspect.current) {
        reportedAspect.current = aspect;
        controller.setAspect(aspect);
      }
    }

    const out = controller.frame(performance.now());
    if (controller.getSnapshot().ready) {
      const { cameraPosition, target } = out;
      state.camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
      state.camera.lookAt(target.x, target.y, target.z);
      poser.current?.(out.clipTime);
    }
    if (out.keepDrawing) state.invalidate();
  });

  return null;
}
