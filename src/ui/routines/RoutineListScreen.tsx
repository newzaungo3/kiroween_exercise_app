import Link from 'next/link';

import { routines } from '@/catalog';

import { sectionName } from '../sections';
import { t } from '../strings';
import { countLabel, lengthLabel, routineName, routinePath } from './labels';
import styles from './RoutineListScreen.module.css';

/**
 * The Routine_List_Screen: the Routines Section heading, one link per
 * Routine_Entry in Catalog order, and a link back to the Home_Screen.
 *
 * The Routine name comes first, so the link's accessible name begins with it.
 * This screen imports nothing from the Viewer.
 */
export function RoutineListScreen() {
  return (
    <>
      <h1 className={styles.title}>{sectionName('routines')}</h1>
      <ul className={styles.list}>
        {routines.map((routine) => (
          <li key={routine.id}>
            <Link className={styles.entry} href={routinePath(routine)}>
              <span className={styles.name}>{routineName(routine)}</span>{' '}
              <span className={styles.length}>{lengthLabel(routine)}</span>{' '}
              <span className={styles.count}>
                {countLabel('exercises', routine.steps.length)}
              </span>{' '}
              <span className={styles.count}>
                {countLabel('stretches', routine.coolDown.length)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link className={styles.backHome} href="/">
        {t('common.backHome')}
      </Link>
    </>
  );
}
