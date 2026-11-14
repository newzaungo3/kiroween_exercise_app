import Link from 'next/link';

import { CandyBalance } from '../progress/CandyBalance';
import { sectionIds, sectionName, sectionPath } from '../sections';
import { t } from '../strings';
import styles from './HomeScreen.module.css';

/**
 * The Home_Screen: the app name, the tagline and the Home_Navigation.
 *
 * - The `<nav>` is the only navigation landmark on the page (Requirement 2.4).
 * - One Navigation_Entry per Section, in `sectionIds` order. Each entry's
 *   visible text is its accessible name (Requirement 2.3).
 */
export function HomeScreen() {
  return (
    <>
      <h1 className={styles.title}>{t('app.name')}</h1>
      <p className={styles.tagline}>{t('home.tagline')}</p>
      <CandyBalance />
      <nav aria-label={t('home.nav.label')}>
        <ul className={styles.navList}>
          {sectionIds.map((id) => (
            <li key={id}>
              <Link className={styles.navEntry} href={sectionPath(id)}>
                {sectionName(id)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
