/**
 * Not-found screen: shown for every path the Site does not serve, including
 * paths nested under a Section route. Shows a heading, a themed message and
 * a link back to the Home_Screen. Every text comes from the Strings_Module.
 */
import Link from 'next/link';

import { t } from '../strings';
import styles from './NotFoundScreen.module.css';

export function NotFoundScreen() {
  return (
    <>
      <h1 className={styles.title}>{t('notFound.heading')}</h1>
      <p className={styles.message}>{t('notFound.message')}</p>
      <Link className={styles.backHome} href="/">
        {t('common.backHome')}
      </Link>
    </>
  );
}
