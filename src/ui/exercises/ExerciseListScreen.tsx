import Link from 'next/link';

import { exercises } from '@/catalog';

import { sectionName } from '../sections';
import { t } from '../strings';
import styles from './ExerciseListScreen.module.css';
import { difficultyLabel, exerciseName, exercisePath, muscleGroupLabel } from './labels';

/**
 * The Exercise_List_Screen: the Exercises Section heading, one
 * Exercise_List_Entry per Exercise in Catalog order, and a link back to the
 * Home_Screen.
 *
 * - Each Exercise_List_Entry is one link. The Spooky_Name comes first, so the
 *   link's accessible name begins with it (Requirement 3.6). The `{' '}`
 *   separators keep the words apart in the accessible name.
 * - This screen imports nothing from the Viewer, so it requests no
 *   Coach_Asset, Still_Image or 3D code (Requirement 3.8).
 */
export function ExerciseListScreen() {
  return (
    <>
      <h1 className={styles.title}>{sectionName('exercises')}</h1>
      <ul className={styles.list}>
        {exercises.map((exercise) => (
          <li key={exercise.id}>
            <Link className={styles.entry} href={exercisePath(exercise)}>
              <span className={styles.name}>{exerciseName(exercise)}</span>{' '}
              <span className={styles.realName}>{t(exercise.realNameId)}</span>{' '}
              <span className={styles.difficulty}>{difficultyLabel(exercise.difficulty)}</span>{' '}
              <span className={styles.muscles}>
                {exercise.muscleGroups.map(muscleGroupLabel).join(' · ')}
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
