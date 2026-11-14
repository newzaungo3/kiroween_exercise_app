import type { Ref } from 'react';

import type { ExerciseEntry } from '@/catalog';
import type { RestingView } from '@/workout-engine';

import { exerciseName } from '../exercises/labels';
import { format, t } from '../strings';
import { formatCountdown } from './clock-text';
import styles from './Panels.module.css';

export interface RestPanelProps {
  readonly view: RestingView;
  /** The Exercise_Entry of the next Set. */
  readonly nextEntry: ExerciseEntry;
  readonly onPause: () => void;
  /** Skips the Rest at once, with no dialog. */
  readonly onSkipRest: () => void;
  /** Receives the clicked button so focus can return to it. */
  readonly onAskQuit: (opener: HTMLElement) => void;
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

/** Rest between Sets. Offers pause, skip Rest and quit; there is no skip Set here. */
export function RestPanel({
  view,
  nextEntry,
  onPause,
  onSkipRest,
  onAskQuit,
  headingRef,
}: RestPanelProps) {
  const { next } = view;
  const target =
    next.target.reps !== undefined
      ? format('routine.target.reps', { reps: String(next.target.reps) })
      : format('routine.target.seconds', { seconds: String(next.target.seconds) });
  return (
    <section className={styles.panel} aria-labelledby="rest-heading">
      <h2 id="rest-heading" ref={headingRef} tabIndex={-1} className={styles.heading}>
        {t('workout.rest.heading')}
      </h2>
      <p role="timer" aria-label={t('workout.timer.rest')} className={styles.timer}>
        {formatCountdown(view.restRemainingMs)}
      </p>
      <p className={styles.text}>
        {format('workout.rest.next', {
          exercise: exerciseName(nextEntry),
          number: String(next.setNumber),
          count: String(next.setCount),
          target,
        })}
      </p>
      <div className={styles.controls}>
        <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={onPause}>
          {t('workout.pause')}
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.secondary}`}
          onClick={onSkipRest}
        >
          {t('workout.skipRest')}
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.secondary}`}
          onClick={(event) => onAskQuit(event.currentTarget)}
        >
          {t('workout.quit')}
        </button>
      </div>
    </section>
  );
}
