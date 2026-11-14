'use client';

import Link from 'next/link';

import { routines } from '@/catalog';

import { routineName } from '../routines/labels';
import { useProgress } from '../progress/useProgress';
import { sectionName } from '../sections';
import { format, t } from '../strings';
import { formatWorkoutDate } from './date';
import styles from './HistoryScreen.module.css';

/**
 * The History_Screen: the Workouts recorded in this browser, newest first,
 * with the total Candy earned. Shows loading text until storage is read.
 */
export function HistoryScreen() {
  const { snapshot } = useProgress();

  return (
    <>
      <h1 className={styles.title}>{sectionName('history')}</h1>
      {snapshot === null ? (
        <p className={styles.text}>{t('history.loading')}</p>
      ) : (
        <>
          <p className={styles.text}>
            {format('history.total', { candy: String(snapshot.totalCandyEarned) })}
          </p>
          {snapshot.history.length === 0 ? (
            <>
              <p className={styles.text}>{t('history.empty')}</p>
              <Link className={styles.link} href="/routines">
                {t('history.empty.link')}
              </Link>
            </>
          ) : (
            <ol className={styles.list} aria-label={t('history.list.label')}>
              {snapshot.history.map((entry) => {
                const routine = routines.find((r) => r.id === entry.routineId);
                return (
                  <li className={styles.entry} key={entry.id}>
                    <time className={styles.date} dateTime={new Date(entry.finishedAt).toISOString()}>
                      {formatWorkoutDate(entry.finishedAt)}
                    </time>
                    <span className={styles.name}>
                      {routine === undefined
                        ? t('history.entry.unknownRoutine')
                        : routineName(routine)}
                    </span>
                    <span>
                      {format('summary.outcome', {
                        outcome: t(`summary.outcome.${entry.outcome}`),
                      })}
                    </span>
                    <span>{format('summary.candy', { candy: String(entry.candyEarned) })}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
      <Link className={styles.link} href="/">
        {t('common.backHome')}
      </Link>
    </>
  );
}
