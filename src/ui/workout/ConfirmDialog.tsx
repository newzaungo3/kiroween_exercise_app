'use client';

/**
 * Confirm_Dialog: a modal question on a native <dialog> opened with
 * showModal(). The browser supplies the dialog role, focus containment and the
 * inert background. Escape and a click on the scrim both cancel. All text
 * arrives through props.
 */

import { useEffect, useId, useRef } from 'react';
import type { MouseEvent } from 'react';
import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  readonly heading: string;
  readonly text: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog({
  heading,
  text,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const textId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (!dialog.open) dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  // Escape: keep React as the owner of the open state.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onCancel();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onCancel]);

  // A click whose target is the dialog itself landed on the scrim.
  const handleScrimClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onCancel();
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={headingId}
      aria-describedby={textId}
      onClick={handleScrimClick}
    >
      <div className={styles.card}>
        <h2 id={headingId} className={styles.heading}>
          {heading}
        </h2>
        <p id={textId} className={styles.text}>
          {text}
        </p>
        <div className={styles.actions}>
          <button ref={cancelRef} type="button" className={styles.button} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.confirm}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
