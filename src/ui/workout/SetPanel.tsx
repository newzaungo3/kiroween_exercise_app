'use client';

import type { Ref } from 'react';

import type { ExerciseEntry } from '@/catalog';
import type { ExercisingView } from '@/workout-engine';
import { maxActualReps, minActualReps } from '@/workout-engine/reps';

import { safetyMessage } from '../crypt/labels';
import { exerciseName } from '../exercises/labels';
import { format, t } from '../strings';
import { formatCountdown } from './clock-text';
import styles from './Panels.module.css';
import { parseActualReps, stepReps } from './reps-field';

export interface SetPanelProps {
  readonly view: ExercisingView;
  readonly entry: ExerciseEntry;
  /** Called with the reported reps for a rep Set, with nothing for a seconds Set. */
  readonly onConfirm: (actualReps?: number) => void;
  /** The rep field text; the caller owns it so it survives a pause. */
  readonly repsText: string;
  readonly onRepsText: (text: string) => void;
  readonly onPause: () => void;
  /** Receives the clicked button so focus can return to it. */
  readonly onAskSkipSet: (opener: HTMLElement) => void;
  readonly onAskQuit: (opener: HTMLElement) => void;
  readonly headingRef?: Ref<HTMLHeadingElement>;
  /** The stored Coach name; null or absent gives the default name. */
  readonly coachName?: string | null;
}

/** The current Set. The caller keys it by `view.position`. */
export function SetPanel({
  view,
  entry,
  onConfirm,
  repsText: text,
  onRepsText: setText,
  onPause,
  onAskSkipSet,
  onAskQuit,
  headingRef,
  coachName = null,
}: SetPanelProps) {
  const { slot, timer } = view;
  const parsed = timer.kind === 'reps' ? parseActualReps(text) : null;
  const invalid = timer.kind === 'reps' && parsed === null;
  const secondsLeft = timer.kind === 'seconds' && timer.remainingMs > 0;
  const finished = timer.kind === 'seconds' && timer.remainingMs <= 0;

  const targetText =
    timer.kind === 'reps'
      ? format('workout.set.targetReps', { reps: String(timer.targetReps) })
      : format('workout.set.targetSeconds', { seconds: String(timer.targetSeconds) });

  function step(delta: -1 | 1): void {
    if (parsed === null) return;
    setText(String(stepReps(parsed, delta)));
  }

  function confirm(): void {
    if (timer.kind === 'reps') {
      if (parsed === null) return;
      onConfirm(parsed);
    } else {
      onConfirm();
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="set-heading">
      <h2 id="set-heading" ref={headingRef} tabIndex={-1} className={styles.heading}>
        {exerciseName(entry)}
      </h2>
      <p className={styles.text}>
        {format('workout.set.of', {
          number: String(slot.setNumber),
          count: String(slot.setCount),
        })}
      </p>
      <p className={styles.muted}>
        {format('workout.set.position', {
          position: String(view.position),
          total: String(view.totalSets),
        })}
      </p>
      <p className={styles.text}>{targetText}</p>

      {timer.kind === 'reps' ? (
        <fieldset className={styles.reps}>
          <legend className={styles.repsLegend}>{t('workout.reps.label')}</legend>
          <button
            type="button"
            className={styles.button}
            aria-label={t('workout.reps.fewer')}
            disabled={parsed === null || parsed <= minActualReps}
            onClick={() => step(-1)}
          >
            −
          </button>
          <input
            className={styles.repsInput}
            type="number"
            inputMode="numeric"
            min={minActualReps}
            max={maxActualReps}
            step={1}
            aria-label={t('workout.reps.label')}
            aria-invalid={invalid}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <button
            type="button"
            className={styles.button}
            aria-label={t('workout.reps.more')}
            disabled={parsed === null || parsed >= maxActualReps}
            onClick={() => step(1)}
          >
            +
          </button>
        </fieldset>
      ) : (
        <>
          <p role="timer" aria-label={t('workout.timer.set')} className={styles.timer}>
            {formatCountdown(timer.remainingMs)}
          </p>
          {finished ? <p className={styles.text}>{t('workout.set.finished')}</p> : null}
        </>
      )}
      <div role="status">
        {invalid ? <p className={styles.invalid}>{t('workout.reps.invalid')}</p> : null}
      </div>

      <button
        type="button"
        className={`${styles.button} ${styles.primary}`}
        disabled={invalid || secondsLeft}
        onClick={confirm}
      >
        {t('workout.confirm')}
      </button>

      <div className={styles.controls}>
        <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={onPause}>
          {t('workout.pause')}
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.secondary}`}
          onClick={(event) => onAskSkipSet(event.currentTarget)}
        >
          {t('workout.skipSet')}
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.secondary}`}
          onClick={(event) => onAskQuit(event.currentTarget)}
        >
          {t('workout.quit')}
        </button>
      </div>

      <div className={styles.safety}>
        <h3 className={styles.safetyHeading}>{t('safety.heading')}</h3>
        <p className={styles.safetyMessage}>{safetyMessage(coachName)}</p>
      </div>
    </section>
  );
}
