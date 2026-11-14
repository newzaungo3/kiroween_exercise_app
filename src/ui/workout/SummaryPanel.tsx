import type { Ref } from 'react';
import Link from 'next/link';

import type { RoutineEntry } from '@/catalog';
import type { SummaryView } from '@/workout-engine';
import { completionBonus } from '@/workout-engine';

import { routinePath } from '../routines/labels';
import { format, t } from '../strings';
import { formatElapsed } from './clock-text';
import styles from './Panels.module.css';

export interface SummaryPanelProps {
  readonly view: SummaryView;
  readonly routine: RoutineEntry;
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

/** End of the Workout. Shows no Viewer and says nothing about saving Candy. */
export function SummaryPanel({ view, routine, headingRef }: SummaryPanelProps) {
  return (
    <section className={styles.panel} aria-labelledby="summary-heading">
      <h2 id="summary-heading" ref={headingRef} tabIndex={-1} className={styles.heading}>
        {t('summary.heading')}
      </h2>
      <ul className={styles.stats}>
        <li>
          {format('summary.outcome', { outcome: t(`summary.outcome.${view.outcome}`) })}
        </li>
        <li>{format('summary.setsConfirmed', { count: String(view.setsConfirmed) })}</li>
        <li>{format('summary.setsSkipped', { count: String(view.setsSkipped) })}</li>
        <li>{format('summary.activeTime', { time: formatElapsed(view.activeMs) })}</li>
        <li>{format('summary.candy', { candy: String(view.candyEarned) })}</li>
      </ul>
      {view.bonusIncluded ? (
        <p className={styles.text}>
          {format('summary.bonus', { bonus: String(completionBonus) })}
        </p>
      ) : null}
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
