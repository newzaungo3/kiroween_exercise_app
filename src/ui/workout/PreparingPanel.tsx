import type { Ref } from 'react';
import Link from 'next/link';

import type { RoutineEntry } from '@/catalog';

import { safetyMessage } from '../crypt/labels';
import { lengthLabel, routineName, routinePath } from '../routines/labels';
import { t } from '../strings';
import styles from './Panels.module.css';

export interface PreparingPanelProps {
  readonly routine: RoutineEntry;
  readonly onStart: () => void;
  readonly headingRef?: Ref<HTMLHeadingElement>;
  /** The stored Coach name; null or absent gives the default name. */
  readonly coachName?: string | null;
}

/** First panel of the Workout screen. Shows the Safety_Message before every Workout. */
export function PreparingPanel({ routine, onStart, headingRef, coachName = null }: PreparingPanelProps) {
  return (
    <section className={styles.panel} aria-labelledby="preparing-heading">
      <h2 id="preparing-heading" ref={headingRef} tabIndex={-1} className={styles.heading}>
        {routineName(routine)}
      </h2>
      <p className={styles.muted}>{lengthLabel(routine)}</p>
      <div className={styles.safety}>
        <h3 className={styles.safetyHeading}>{t('safety.heading')}</h3>
        <p className={styles.safetyMessage}>{safetyMessage(coachName)}</p>
      </div>
      <button type="button" className={`${styles.button} ${styles.primary}`} onClick={onStart}>
        {t('workout.start')}
      </button>
      <div className={styles.links}>
        <Link className={styles.link} href={routinePath(routine)}>
          {t('workout.preparing.back')}
        </Link>
      </div>
    </section>
  );
}
