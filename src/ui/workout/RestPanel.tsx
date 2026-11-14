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
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

/** Rest between Sets. Offers no skip control (ticket 07). */
export function RestPanel({ view, nextEntry, headingRef }: RestPanelProps) {
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
    </section>
  );
}
