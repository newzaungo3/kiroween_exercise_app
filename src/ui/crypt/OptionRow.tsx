/**
 * One Crypt_Option on the Crypt_Screen: name, state, and its buttons.
 * An Owned_Option has an Equip toggle; a Locked_Option has a Preview toggle
 * and an Unlock button that is disabled, with the Shortfall, when the Candy
 * is not enough. Every button has a text name, never an icon alone.
 */
import { format, t } from '../strings';
import { coachColorVar } from './coach-colors';
import { optionName } from './labels';
import type { OptionState } from './offers';
import styles from './CryptScreen.module.css';

export interface OptionRowProps {
  readonly state: OptionState;
  readonly onEquip: (state: OptionState) => void;
  readonly onPreview: (state: OptionState) => void;
  readonly onUnlock: (state: OptionState) => void;
}

export function OptionRow({ state, onEquip, onPreview, onUnlock }: OptionRowProps) {
  const { option, ownership, equipped, previewed, unlock, hiddenBy } = state;
  const name = optionName(option);
  const needMoreId = `crypt-need-more-${option.id}`;
  const hiddenId = `crypt-hidden-${option.id}`;

  const stateText =
    ownership === 'free'
      ? t('crypt.option.free')
      : ownership === 'unlocked'
        ? t('crypt.option.unlocked')
        : format('crypt.option.price', { price: String(option.price) });

  return (
    <li className={styles.row}>
      <div className={styles.rowInfo}>
        {option.kind === 'color' ? (
          <span
            className={styles.swatch}
            style={{ backgroundColor: coachColorVar(option.id) }}
            aria-hidden="true"
          />
        ) : null}
        <span className={styles.optionName}>{name}</span>
        <span className={styles.optionState}>{stateText}</span>
        {equipped ? <span className={styles.equipped}>{t('crypt.option.equipped')}</span> : null}
        {hiddenBy === null ? null : (
          <span className={styles.note} id={hiddenId}>
            {format('crypt.option.hiddenBy', { accessory: optionName(hiddenBy) })}
          </span>
        )}
      </div>
      <div className={styles.rowButtons}>
        {unlock === null ? (
          <button
            type="button"
            className={styles.button}
            aria-pressed={equipped}
            onClick={() => onEquip(state)}
          >
            {format('crypt.equip', { option: name })}
          </button>
        ) : (
          <>
            <button
              type="button"
              className={styles.button}
              aria-pressed={previewed}
              onClick={() => onPreview(state)}
            >
              {format('crypt.preview', { option: name })}
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={!unlock.enabled}
              aria-describedby={unlock.enabled ? undefined : needMoreId}
              onClick={() => onUnlock(state)}
            >
              {format('crypt.unlock', { option: name, price: String(unlock.price) })}
            </button>
            {unlock.enabled ? null : (
              <span className={styles.note} id={needMoreId}>
                {format('crypt.needMore', { count: String(unlock.shortBy) })}
              </span>
            )}
          </>
        )}
      </div>
    </li>
  );
}
