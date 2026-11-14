import type { Ref } from 'react';
import Link from 'next/link';

import { findEntryById } from '@/catalog';
import type { RoutineEntry } from '@/catalog';
import type { SetSlot, SummaryView } from '@/workout-engine';
import { completionBonus } from '@/workout-engine';

import { exerciseName } from '../exercises/labels';
import { routinePath } from '../routines/labels';
import { format, t } from '../strings';
import { formatElapsed } from './clock-text';
import styles from './Panels.module.css';

export interface SummaryPanelProps {
  readonly view: SummaryView;
  readonly routine: RoutineEntry;
  /**
   * The Workout's Sets in order, one per entry of `view.results`. Required so each
   * Set can be named in the list. WorkoutScreen passes them from the Workout.
   */
  readonly slots: readonly SetSlot[];
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

/** End of the Workout. Shows no Viewer and says nothing about saving Candy. */
export function SummaryPanel({ view, routine, slots, headingRef }: SummaryPanelProps) {
  const bonus = String(completionBonus);
  return (
    <section className={styles.panel} aria-labelledby="summary-heading">
      <h2 id="summary-heading" ref={headingRef} tabIndex={-1} className={styles.heading}>
        {view.outcome === 'abandoned' ? t('summary.heading.ended') : t('summary.heading')}
      </h2>
      <ul className={styles.stats}>
        <li>
          {format('summary.outcome', { outcome: t(`summary.outcome.${view.outcome}`) })}
        </li>
        <li>{format('summary.setsConfirmed', { count: String(view.setsConfirmed) })}</li>
        <li>{format('summary.setsSkipped', { count: String(view.setsSkipped) })}</li>
        {view.setsNotReached > 0 ? (
          <li>{format('summary.setsNotReached', { count: String(view.setsNotReached) })}</li>
        ) : null}
        <li>{format('summary.activeTime', { time: formatElapsed(view.activeMs) })}</li>
        <li>{format('summary.candy', { candy: String(view.candyEarned) })}</li>
      </ul>
      {view.outcome === 'completed' ? (
        <p className={styles.text}>{format('summary.bonus', { bonus })}</p>
      ) : (
        <p className={styles.text}>{format('summary.noBonus', { bonus })}</p>
      )}
      <h3 className={styles.subheading}>{t('summary.sets.heading')}</h3>
      <ol className={styles.setList}>
        {slots.map((slot, index) => {
          const entry = findEntryById(slot.entryId);
          if (entry === undefined) throw new Error(`Unknown Catalog entry: ${slot.entryId}`);
          const result = view.results[index];
          if (result === undefined) throw new Error(`Summary has no result for Set ${index}`);
          return (
            <li key={`${slot.entryId}-${slot.setNumber}-${index}`}>
              {format('summary.set.line', {
                exercise: exerciseName(entry),
                number: String(slot.setNumber),
                count: String(slot.setCount),
                state: t(`summary.result.${result}`),
              })}
            </li>
          );
        })}
      </ol>
      <div className={styles.links}>
        <Link className={styles.link} href={routinePath(routine)}>
          {t('summary.backToRoutine')}
        </Link>
        <Link className={styles.link} href="/">
          {t('common.backHome')}
        </Link>
      </div>
    </section>
  );
}
