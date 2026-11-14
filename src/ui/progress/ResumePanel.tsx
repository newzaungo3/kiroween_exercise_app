import type { Ref } from 'react';

import { exerciseName } from '@/ui/exercises/labels';
import { routineName } from '@/ui/routines/labels';

import { format, t } from '../strings';
import type { CheckpointInfo } from './checkpoint-info';
import styles from './ResumePanel.module.css';

export interface ResumePanelProps {
  readonly info: CheckpointInfo;
  readonly onResume: () => void;
  readonly onDiscard: () => void;
  /** Lets the Workout_Route move focus to the heading. */
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

/**
 * The Resume_Prompt panel: what is waiting, the question and two buttons.
 * Presentational. Not a live region.
 */
export function ResumePanel({ info, onResume, onDiscard, headingRef }: ResumePanelProps) {
  const text = format(info.resting ? 'resume.text.rest' : 'resume.text', {
    routine: routineName(info.routine),
    exercise: exerciseName(info.entry),
    number: String(info.setNumber),
    count: String(info.setCount),
    candy: String(info.candyEarned),
  });
  return (
    <section className={styles.panel} aria-labelledby="resume-heading">
      <h2 id="resume-heading" className={styles.heading} ref={headingRef} tabIndex={-1}>
        {t('resume.heading')}
      </h2>
      <p className={styles.text}>{text}</p>
      <p className={styles.note}>{t('resume.awayNote')}</p>
      <p className={styles.question}>{t('resume.question')}</p>
      <div className={styles.actions}>
        <button type="button" className={`${styles.button} ${styles.primary}`} onClick={onResume}>
          {t('resume.resume')}
        </button>
        <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={onDiscard}>
          {t('resume.discard')}
        </button>
      </div>
      <p className={styles.note}>{t('resume.discard.hint')}</p>
    </section>
  );
}
