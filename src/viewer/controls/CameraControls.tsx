/**
 * Camera_Controls: the Front, Side and Back Camera_Preset buttons and a pad
 * with a button for every camera gesture (Open decision 3, Option A):
 * Rotate left and right, Tilt up and down, Zoom in and out.
 *
 * Presentational only: the Viewer island maps each callback to the
 * controller. `rotateStepDeg` and `tiltStepDeg` give the signed steps the
 * island passes to `controller.rotate` and `controller.tilt`.
 */
import type { ReactNode } from 'react';

import type { CameraPreset } from '@/viewer/logic/orbit';
import { t, type StringId } from '@/ui/strings';

import styles from './controls.module.css';
import {
  RotateLeftIcon,
  RotateRightIcon,
  TiltDownIcon,
  TiltUpIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from './icons';

export type RotateDirection = 'left' | 'right';
export type TiltDirection = 'up' | 'down';
export type ZoomDirection = 'in' | 'out';

/**
 * Azimuth change per Rotate activation (Requirements 7.5, 7.8): Rotate left
 * increases the Azimuth, towards the Side Camera_Preset; Rotate right
 * decreases it, like a drag to the right.
 */
export const rotateStepDeg: { readonly [D in RotateDirection]: number } = { left: 45, right: -45 };

/**
 * Elevation change per Tilt activation (Requirements 7.5, 7.9): Tilt up
 * raises the camera, like a drag downwards. The controller clamps at the
 * limits.
 */
export const tiltStepDeg: { readonly [D in TiltDirection]: number } = { up: 15, down: -15 };

/** Camera_Preset buttons in display order, with their Strings_Module labels. */
const presets: readonly { readonly preset: CameraPreset; readonly labelId: StringId }[] = [
  { preset: 'front', labelId: 'viewer.view.front' },
  { preset: 'side', labelId: 'viewer.view.side' },
  { preset: 'back', labelId: 'viewer.view.back' },
];

export interface CameraControlsProps {
  /** True while the 3D scene is not shown yet (Requirement 7.7). */
  readonly disabled: boolean;
  readonly onPreset: (preset: CameraPreset) => void;
  readonly onRotate: (direction: RotateDirection) => void;
  /** Open decision 3: removed under Option B. */
  readonly onTilt: (direction: TiltDirection) => void;
  readonly onZoom: (direction: ZoomDirection) => void;
}

interface PadButtonProps {
  readonly labelId: StringId;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}

/** One icon-only pad button; its accessible name comes from the Strings_Module. */
function PadButton({ labelId, disabled, onClick, children }: PadButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.button} ${styles.iconButton}`}
      aria-label={t(labelId)}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function CameraControls({ disabled, onPreset, onRotate, onTilt, onZoom }: CameraControlsProps) {
  return (
    <div className={styles.controls} data-viewer-controls="camera">
      <div className={styles.group} role="group" aria-label={t('viewer.views.label')}>
        {presets.map(({ preset, labelId }) => (
          <button
            key={preset}
            type="button"
            className={styles.button}
            disabled={disabled}
            onClick={() => onPreset(preset)}
          >
            {t(labelId)}
          </button>
        ))}
      </div>
      <div className={styles.group} role="group" aria-label={t('viewer.camera.label')}>
        <PadButton labelId="viewer.rotateLeft" disabled={disabled} onClick={() => onRotate('left')}>
          <RotateLeftIcon className={styles.icon} />
        </PadButton>
        <PadButton labelId="viewer.rotateRight" disabled={disabled} onClick={() => onRotate('right')}>
          <RotateRightIcon className={styles.icon} />
        </PadButton>
        <PadButton labelId="viewer.tiltUp" disabled={disabled} onClick={() => onTilt('up')}>
          <TiltUpIcon className={styles.icon} />
        </PadButton>
        <PadButton labelId="viewer.tiltDown" disabled={disabled} onClick={() => onTilt('down')}>
          <TiltDownIcon className={styles.icon} />
        </PadButton>
        <PadButton labelId="viewer.zoomIn" disabled={disabled} onClick={() => onZoom('in')}>
          <ZoomInIcon className={styles.icon} />
        </PadButton>
        <PadButton labelId="viewer.zoomOut" disabled={disabled} onClick={() => onZoom('out')}>
          <ZoomOutIcon className={styles.icon} />
        </PadButton>
      </div>
    </div>
  );
}
