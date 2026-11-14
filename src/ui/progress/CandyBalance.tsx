'use client';

import { welcomeGiftCandy } from '@/progress-store';

import { format, t } from '../strings';
import styles from './CandyBalance.module.css';
import { useProgress } from './useProgress';

/**
 * The Candy_Balance of the Home_Screen: a client island that shows the loading
 * text until the browser has read storage, then the balance, the Welcome gift
 * line in the visit that granted it, and the "cannot keep" line when storage
 * is memory only. No live region and no role.
 */
export function CandyBalance() {
  const { snapshot, welcomeJustGranted } = useProgress();

  if (snapshot === null) {
    return (
      <div className={styles.block}>
        <p className={styles.line}>{t('home.candy.loading')}</p>
      </div>
    );
  }

  return (
    <div className={styles.block}>
      <p className={styles.line}>
        {format('home.candy.balance', { candy: String(snapshot.candyBalance) })}
      </p>
      {welcomeJustGranted ? (
        <p className={styles.line}>
          {format('home.candy.welcome', { candy: String(welcomeGiftCandy) })}
        </p>
      ) : null}
      {snapshot.persistent ? null : <p className={styles.line}>{t('progress.unavailable')}</p>}
    </div>
  );
}
