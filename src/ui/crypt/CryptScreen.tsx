'use client';

import Link from 'next/link';
import { useReducer, useState } from 'react';

import { cryptContent, findEntryById } from '@/catalog';
import { ViewerIsland } from '@/viewer/ViewerIsland';

import { useProgress } from '../progress/useProgress';
import { sectionName } from '../sections';
import { format, t } from '../strings';
import { appearanceOf } from './appearance';
import { CoachNameForm } from './CoachNameForm';
import { coachNameOrDefault, optionName } from './labels';
import { resolveLook } from './look';
import { optionStates, type OptionState } from './offers';
import { OptionRow } from './OptionRow';
import {
  emptyPreview,
  previewReducer,
  prunePreview,
  shownLook,
  type Preview,
  type PreviewAction,
} from './preview';
import styles from './CryptScreen.module.css';

/**
 * The Crypt_Screen: the Coach, the Candy balance, the Coach name, and every
 * Coach color and Accessory with Preview, Unlock and Equip. The server HTML
 * is the loading state; storage is read only in the browser. The Preview
 * lives in page memory and is never stored.
 */
export function CryptScreen() {
  const progress = useProgress();
  const { snapshot } = progress;
  const [rawPreview, dispatch] = useReducer(
    (state: Preview, action: PreviewAction) => previewReducer(state, action),
    emptyPreview,
  );
  const [message, setMessage] = useState('');

  // An option that became Owned (an Unlock, or another tab) leaves the Preview.
  const preview = snapshot === null ? rawPreview : prunePreview(rawPreview, snapshot);

  const previewExercise = findEntryById(cryptContent.previewExerciseId);
  const shown = shownLook(resolveLook(snapshot), preview);
  const appearance = appearanceOf(shown, { fetchAccessories: true });

  if (snapshot === null) {
    return (
      <>
        <h1 className={styles.title}>{sectionName('crypt')}</h1>
        <p className={styles.text}>{t('crypt.loading')}</p>
        <BackHome />
      </>
    );
  }

  const states = optionStates(snapshot, snapshot.candyBalance, preview);
  const coachName = snapshot.coach.name;

  const onEquip = (state: OptionState): void => {
    const { option, equipped } = state;
    const name = optionName(option);
    if (option.kind === 'color') {
      if (equipped) return;
      const result = progress.equipColor(option.isDefault ? null : option.id);
      if (result.changed) setMessage(format('crypt.announce.equipped', { option: name }));
      return;
    }
    const result = progress.setAccessoryEquipped(option.id, !equipped);
    if (result.changed) {
      setMessage(
        format(equipped ? 'crypt.announce.unequipped' : 'crypt.announce.equipped', {
          option: name,
        }),
      );
    }
  };

  const onPreview = (state: OptionState): void => {
    const { option } = state;
    dispatch(
      option.kind === 'color'
        ? { type: 'toggleColor', id: option.id }
        : { type: 'toggleAccessory', id: option.id },
    );
  };

  const onUnlock = (state: OptionState): void => {
    const { option } = state;
    const result = progress.unlock({ id: option.id, kind: option.kind, price: option.price });
    if (result.unlocked) {
      dispatch({ type: 'drop', id: option.id });
      setMessage(
        format('crypt.announce.unlocked', {
          option: optionName(option),
          candy: String(result.candyBalance),
        }),
      );
    } else if (result.reason === 'insufficient') {
      setMessage(
        format('crypt.announce.short', {
          option: optionName(option),
          count: String(result.shortBy),
        }),
      );
    } else if (result.reason === 'already') {
      dispatch({ type: 'drop', id: option.id });
    }
  };

  const onSaveName = (text: string) => {
    const result = progress.setCoachName(text);
    if (result.saved) {
      setMessage(format('crypt.announce.named', { coach: coachNameOrDefault(result.name) }));
    }
    return result;
  };

  const previewing = preview.color !== null || preview.accessories.length > 0;

  return (
    <>
      <h1 className={styles.title}>{sectionName('crypt')}</h1>
      <p className={styles.text}>
        {format('crypt.intro', { coach: coachNameOrDefault(coachName) })}
      </p>
      <p className={styles.balance} role="status">
        {format('crypt.balance', { candy: String(snapshot.candyBalance) })}
      </p>
      {snapshot.persistent ? null : (
        <p className={styles.text}>{t('progress.unavailable')}</p>
      )}

      {previewExercise === undefined ? null : (
        <div className={styles.viewer}>
          <ViewerIsland exercise={previewExercise} appearance={appearance} />
        </div>
      )}
      {previewing ? (
        <div className={styles.previewBar}>
          <p className={styles.note}>{t('crypt.preview.note')}</p>
          <button
            type="button"
            className={styles.button}
            onClick={() => dispatch({ type: 'clear' })}
          >
            {t('crypt.preview.stop')}
          </button>
        </div>
      ) : null}

      <CoachNameForm key={coachName ?? ''} name={coachName} onSave={onSaveName} />

      <OptionSection
        heading={t('crypt.colors.heading')}
        states={states.colors}
        onEquip={onEquip}
        onPreview={onPreview}
        onUnlock={onUnlock}
      />
      <OptionSection
        heading={t('crypt.accessories.heading')}
        states={states.accessories}
        onEquip={onEquip}
        onPreview={onPreview}
        onUnlock={onUnlock}
      />

      <p className={styles.live} aria-live="polite" aria-atomic="true">
        {message}
      </p>
      <BackHome />
    </>
  );
}

interface OptionSectionProps {
  readonly heading: string;
  readonly states: readonly OptionState[];
  readonly onEquip: (state: OptionState) => void;
  readonly onPreview: (state: OptionState) => void;
  readonly onUnlock: (state: OptionState) => void;
}

function OptionSection({ heading, states, onEquip, onPreview, onUnlock }: OptionSectionProps) {
  return (
    <section className={styles.section} aria-label={heading}>
      <h2 className={styles.heading}>{heading}</h2>
      <ul className={styles.list}>
        {states.map((state) => (
          <OptionRow
            key={state.option.id}
            state={state}
            onEquip={onEquip}
            onPreview={onPreview}
            onUnlock={onUnlock}
          />
        ))}
      </ul>
    </section>
  );
}

function BackHome() {
  return (
    <Link className={styles.link} href="/">
      {t('common.backHome')}
    </Link>
  );
}
