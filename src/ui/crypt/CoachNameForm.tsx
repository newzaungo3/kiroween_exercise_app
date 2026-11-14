'use client';

import { useId, useState, type FormEvent } from 'react';

import { coachNameMaxLength, normaliseCoachName } from '../progress/useProgress';
import type { CoachNameResult } from '../progress/useProgress';
import { format, t } from '../strings';
import { coachNameOrDefault } from './labels';
import styles from './CryptScreen.module.css';

export interface CoachNameFormProps {
  /** The stored Coach name; null for the default. */
  readonly name: string | null;
  /** Saves the text; the Progress_Store is the authority. */
  readonly onSave: (text: string) => CoachNameResult;
}

/** The Coach name field: free to change; the stored value is always plain text. */
export function CoachNameForm({ name, onSave }: CoachNameFormProps) {
  const [draft, setDraft] = useState(name ?? '');
  const [attempted, setAttempted] = useState(false);
  const ids = useId();
  const inputId = `${ids}-input`;
  const hintId = `${ids}-hint`;
  const invalidId = `${ids}-invalid`;

  const invalid = attempted && normaliseCoachName(draft) === 'invalid';
  const count = String(coachNameMaxLength);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const result = onSave(draft);
    if (result.saved) {
      setAttempted(false);
      setDraft(result.name ?? '');
    } else {
      setAttempted(true);
    }
  };

  return (
    <section className={styles.section} aria-labelledby={`${ids}-heading`}>
      <h2 className={styles.heading} id={`${ids}-heading`}>
        {t('crypt.name.heading')}
      </h2>
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.label} htmlFor={inputId}>
          {t('crypt.name.label')}
        </label>
        <input
          id={inputId}
          className={styles.input}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? `${hintId} ${invalidId}` : hintId}
          onChange={(event) => setDraft(event.target.value)}
        />
        <p className={styles.note} id={hintId}>
          {format('crypt.name.hint', { count, coach: coachNameOrDefault(null) })}
        </p>
        {invalid ? (
          <p className={styles.invalid} id={invalidId}>
            {format('crypt.name.invalid', { count })}
          </p>
        ) : null}
        <button type="submit" className={styles.button}>
          {t('crypt.name.save')}
        </button>
      </form>
    </section>
  );
}
