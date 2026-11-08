/**
 * Placeholder_Screen: shown at a Section's route until a later ticket builds
 * the real Section. Shows the Section name, a short "not built yet" message
 * and a link back to the Home_Screen. Every text comes from the
 * Strings_Module.
 */
import Link from 'next/link';

import { type SectionId, sectionMessage, sectionName } from '../sections';
import { t } from '../strings';
import styles from './PlaceholderScreen.module.css';

export interface PlaceholderScreenProps {
  readonly sectionId: SectionId;
}

export function PlaceholderScreen({ sectionId }: PlaceholderScreenProps) {
  return (
    <>
      <h1 className={styles.title}>{sectionName(sectionId)}</h1>
      <p className={styles.message}>{sectionMessage(sectionId)}</p>
      <Link className={styles.backHome} href="/">
        {t('common.backHome')}
      </Link>
    </>
  );
}
