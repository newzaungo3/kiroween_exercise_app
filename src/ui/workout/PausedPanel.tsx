import type { ReactNode, Ref } from 'react';

import { findEntryById } from '@/catalog';
import type { PausedView } from '@/workout-engine';

import { exerciseName } from '../exercises/labels';
import { format, t } from '../strings';
import { formatCountdown } from './clock-text';
import styles from './Panels.module.css';

export interface PausedPanelProps {
  readonly view: PausedView;
  readonly onResume: () => void;
  /** Receives the clicked button so focus can return to it. */
  readonly onAskQuit: (opener: HTMLElement) => void;
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

/** The frozen Workout. Shows what was held and offers only Resume and Quit. */
export function PausedPanel({ view, onResume, onAskQuit, headingRef }: PausedPanelProps) {
  const { held } = view;
  const slot = held.phase === 'exercising' ? held.slot : held.next;
  const entry = findEntryById(slot.entryId);
  if (entry === undefined) throw new Error(`Unknown Catalog entry: ${slot.entryId}`);

  let position: ReactNode;
  let timer: { label: string; ms: number } | null = null;
  if (held.phase === 'exercising') {
    position = (
      <>
        <p className={styles.text}>
          {format('workout.set.of', {
            number: String(slot.setNumber),
            count: String(slot.setCount),
          })}
        </p>
        <p className={styles.muted}>
          {format('workout.set.position', {
            position: String(held.position),
            total: String(held.totalSets),
          })}
        </p>
      </>
    );
    if (held.timer.kind === 'seconds') {
      timer = { label: t('workout.timer.set'), ms: held.timer.remainingMs };
    }
  } else {
    const target =
      slot.target.reps !== undefined
        ? format('routine.target.reps', { reps: String(slot.target.reps) })
        : format('routine.target.seconds', { seconds: String(slot.target.seconds) });
    position = (
      <p className={styles.text}>
        {format('workout.rest.next', {
          exercise: exerciseName(entry),
          number: String(slot.setNumber),
          count: String(slot.setCount),
          target,
        })}
      </p>
    );
    timer = { label: t('workout.timer.rest'), ms: held.restRemainingMs };
  }

  return (
    <section className={styles.panel} aria-labelledby="paused-heading">
      <h2 id="paused-heading" ref={headingRef} tabIndex={-1} className={styles.heading}>
        {t('workout.paused.heading')}
      </h2>
      <p className={styles.text}>
        {t(
          view.cause === 'auto'
            ? 'workout.paused.auto'
            : view.cause === 'restored'
              ? 'workout.paused.restored'
              : 'workout.paused.user',
        )}
      </p>
      <p className={styles.text}>{exerciseName(entry)}</p>
      {position}
      {timer !== null ? (
        <p role="timer" aria-label={timer.label} className={styles.timer}>
          {formatCountdown(timer.ms)}
        </p>
      ) : null}
      <div className={styles.controls}>
        <button type="button" className={`${styles.button} ${styles.primary}`} onClick={onResume}>
          {t('workout.resume')}
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
