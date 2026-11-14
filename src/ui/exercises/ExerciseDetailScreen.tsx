/**
 * Exercise_Detail_Screen: one Exercise's Viewer and Written_Content.
 *
 * A Server Component. Everything except the Viewer island's inner state is
 * static HTML, so the Written_Content and the Safety_Message are in the
 * prerendered page and stay visible in every Viewer state (Requirements 4.5,
 * 4.6). The Viewer is reached only through `@/viewer/ViewerIsland`.
 *
 * DOM order equals visual order, so Tab order follows reading order
 * (Requirement 12.4). Every text comes from the Strings_Module.
 */
import Link from 'next/link';

import { entriesOfKind, neighbours, type ExerciseEntry } from '@/catalog';
import { ViewerIsland } from '@/viewer/ViewerIsland';

import { format, t } from '../strings';
import styles from './ExerciseDetailScreen.module.css';
import {
  backToListLabel,
  difficultyLabel,
  exerciseName,
  exercisePath,
  listPath,
  muscleGroupLabel,
  targetFact,
} from './labels';

export interface ExerciseDetailScreenProps {
  readonly exercise: ExerciseEntry;
}

export function ExerciseDetailScreen({ exercise }: ExerciseDetailScreenProps) {
  const target = targetFact(exercise);
  const { previous, next } = neighbours<ExerciseEntry>(
    entriesOfKind(exercise.kind),
    exercise,
  );
  return (
    <>
      <Link className={styles.back} href={listPath(exercise.kind)}>
        {backToListLabel(exercise.kind)}
      </Link>
      <h1 className={styles.title}>{exerciseName(exercise)}</h1>
      <ViewerIsland key={exercise.id} exercise={exercise} />
      <section className={styles.safety} aria-labelledby="safety-heading">
        <h2 id="safety-heading" className={styles.safetyHeading}>
          {t('safety.heading')}
        </h2>
        <p className={styles.safetyMessage}>{t('safety.coachMessage')}</p>
      </section>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt className={styles.factLabel}>{t('exercise.facts.realName')}</dt>
          <dd className={styles.factValue}>{t(exercise.realNameId)}</dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factLabel}>{t('exercise.facts.difficulty')}</dt>
          <dd className={styles.factValue}>{difficultyLabel(exercise.difficulty)}</dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factLabel}>{t('exercise.facts.muscleGroups')}</dt>
          <dd className={styles.factValue}>
            <ul className={styles.muscleList}>
              {exercise.muscleGroups.map((muscleGroup) => (
                <li key={muscleGroup}>{muscleGroupLabel(muscleGroup)}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factLabel}>{target.label}</dt>
          <dd className={styles.factValue}>{target.value}</dd>
        </div>
      </dl>
      <h2 className={styles.heading}>{t('exercise.steps.heading')}</h2>
      <ol className={styles.steps}>
        {exercise.stepIds.map((id) => (
          <li key={id}>{t(id)}</li>
        ))}
      </ol>
      <h2 className={styles.heading}>{t('exercise.cues.heading')}</h2>
      <ul className={styles.list}>
        {exercise.cueIds.map((id) => (
          <li key={id}>{t(id)}</li>
        ))}
      </ul>
      <h2 className={styles.heading}>{t('exercise.safetyNotes.heading')}</h2>
      <ul className={styles.list}>
        {exercise.safetyNoteIds.map((id) => (
          <li key={id}>{t(id)}</li>
        ))}
      </ul>
      {previous !== undefined || next !== undefined ? (
        <nav className={styles.pager} aria-label={t('pager.label')}>
          {previous !== undefined ? (
            <Link className={styles.pagerLink} href={exercisePath(previous)}>
              {format('pager.previous', { exercise: exerciseName(previous) })}
            </Link>
          ) : null}
          {next !== undefined ? (
            <Link className={styles.pagerLink} href={exercisePath(next)}>
              {format('pager.next', { exercise: exerciseName(next) })}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
