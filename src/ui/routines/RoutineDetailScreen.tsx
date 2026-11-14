/**
 * Routine_Detail_Screen: one Routine's steps, Cool-down and a start link.
 *
 * A Server Component with no Viewer. Each step links to its Exercise's
 * detail screen. DOM order equals visual order. Every text comes from the
 * Strings_Module.
 */
import Link from 'next/link';

import type { RoutineEntry, RoutineStep } from '@/catalog';

import { exerciseName, exercisePath } from '../exercises/labels';
import { t } from '../strings';
import { entryOfStep, lengthLabel, routineName, stepLine, workoutPath } from './labels';
import styles from './RoutineDetailScreen.module.css';

export interface RoutineDetailScreenProps {
  readonly routine: RoutineEntry;
}

function StepList({ steps }: { readonly steps: readonly RoutineStep[] }) {
  return (
    <ol className={styles.steps}>
      {steps.map((step, index) => {
        const entry = entryOfStep(step);
        return (
          <li key={`${step.entryId}-${index}`}>
            <Link className={styles.stepLink} href={exercisePath(entry)}>
              <span className={styles.stepName}>{exerciseName(entry)}</span>
              <span className={styles.stepLine}>{stepLine(step)}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

export function RoutineDetailScreen({ routine }: RoutineDetailScreenProps) {
  return (
    <>
      <Link className={styles.back} href="/routines">
        {t('routine.detail.back')}
      </Link>
      <h1 className={styles.title}>{routineName(routine)}</h1>
      <p className={styles.length}>{lengthLabel(routine)}</p>
      <h2 className={styles.heading}>{t('routine.detail.steps.heading')}</h2>
      <StepList steps={routine.steps} />
      <h2 className={styles.heading}>{t('routine.detail.coolDown.heading')}</h2>
      <StepList steps={routine.coolDown} />
      <Link className={styles.start} href={workoutPath(routine)}>
        {t('routine.detail.start')}
      </Link>
    </>
  );
}
