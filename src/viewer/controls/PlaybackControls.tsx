/**
 * Playback_Controls: one Play/Pause button and the three Playback_Speed
 * buttons.
 *
 * Presentational only: the Viewer island passes the controller's snapshot
 * and callbacks. Rendered only inside the client island.
 */
import type { ViewerSnapshot } from '@/viewer/logic/controller';
import { playbackSpeeds, type PlaybackSpeed } from '@/viewer/logic/playback';
import { t, type StringId } from '@/ui/strings';

import styles from './controls.module.css';
import { CheckIcon, PauseIcon, PlayIcon } from './icons';

/** Strings_Module label of each Playback_Speed button. */
const speedLabelId: { readonly [S in PlaybackSpeed]: StringId } = {
  0.5: 'viewer.speed.half',
  0.75: 'viewer.speed.threeQuarters',
  1: 'viewer.speed.normal',
};

export interface PlaybackControlsProps {
  /** Play state and selected Playback_Speed, from the Viewer controller. */
  readonly snapshot: Pick<ViewerSnapshot, 'playing' | 'speed'>;
  /** True while the 3D scene is not shown yet (Requirement 8.9). */
  readonly disabled: boolean;
  /** Disables only the Play/Pause button, e.g. while the Coach_Hold is on. */
  readonly playDisabled?: boolean;
  readonly onTogglePlay: () => void;
  readonly onSpeed: (speed: PlaybackSpeed) => void;
}

export function PlaybackControls({
  snapshot,
  disabled,
  playDisabled = false,
  onTogglePlay,
  onSpeed,
}: PlaybackControlsProps) {
  const { playing, speed } = snapshot;
  return (
    <div className={styles.controls} data-viewer-controls="playback">
      {/* The visible text is the accessible name and names the next action (Requirement 8.4). */}
      <button
        type="button"
        className={`${styles.button} ${styles.playPause}`}
        disabled={disabled || playDisabled}
        onClick={onTogglePlay}
      >
        {playing ? <PauseIcon className={styles.icon} /> : <PlayIcon className={styles.icon} />}
        <span>{playing ? t('viewer.pause') : t('viewer.play')}</span>
      </button>
      <div className={styles.group} role="group" aria-label={t('viewer.speed.label')}>
        {playbackSpeeds.map((option) => {
          const selected = option === speed;
          return (
            <button
              key={option}
              type="button"
              className={styles.button}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onSpeed(option)}
            >
              {selected && <CheckIcon className={styles.checkIcon} />}
              <span>{t(speedLabelId[option])}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
