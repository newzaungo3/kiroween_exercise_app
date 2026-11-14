'use client';

/**
 * Workout_Screen: the client island that runs one Workout.
 *
 * One Viewer sits above the panels, keyed by Exercise id, so it resets when
 * the Exercise changes and survives Set to Rest to Set of the same Exercise.
 * A pause keeps the same mounted Viewer and only sets its hold. The summary
 * shows none. The live region changes only when the panel changes and never
 * carries a timer. Nothing is written to browser storage.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { findEntryById } from '@/catalog';
import type { ExerciseEntry, RoutineEntry } from '@/catalog';
import { completionBonus } from '@/workout-engine';
import type { SummaryView, WorkoutView } from '@/workout-engine';

import { exerciseName } from '../exercises/labels';
import { routineName } from '../routines/labels';
import { format, t } from '../strings';
import { CoachViewer } from './CoachViewer';
import { ConfirmDialog } from './ConfirmDialog';
import { dialogApplies } from './dialogs';
import type { DialogKind } from './dialogs';
import { PausedPanel } from './PausedPanel';
import { PreparingPanel } from './PreparingPanel';
import { RestPanel } from './RestPanel';
import { SetPanel } from './SetPanel';
import { SummaryPanel } from './SummaryPanel';
import { useWorkoutRun } from './useWorkoutRun';
import styles from './WorkoutScreen.module.css';

export interface WorkoutScreenProps {
  readonly routine: RoutineEntry;
  /** Called exactly once when the Workout reaches the summary, for every outcome. */
  readonly onFinished?: (view: SummaryView) => void;
  /** The Candy balance after the Workout was recorded; null or absent until known. */
  readonly recordedBalance?: number | null;
}

interface OpenDialog {
  readonly kind: DialogKind;
  readonly opener: HTMLElement;
}

function entryOrThrow(id: string): ExerciseEntry {
  const entry = findEntryById(id);
  if (entry === undefined) throw new Error(`Unknown Catalog entry: ${id}`);
  return entry;
}

/** Identity of the active panel; changes exactly when the panel heading changes. */
function panelKey(view: WorkoutView | null): string {
  if (view === null) return 'preparing';
  if (view.phase === 'exercising') return `set-${view.position}`;
  if (view.phase === 'resting') return `rest-${view.nextPosition}`;
  if (view.phase === 'paused') return 'paused';
  return 'summary';
}

export function WorkoutScreen({ routine, onFinished, recordedBalance }: WorkoutScreenProps) {
  const { view, slots, notice, start, confirm, skipSet, skipRest, pause, resume, quit } =
    useWorkoutRun(routine);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownKey = useRef<string | null>(null);
  const key = panelKey(view);

  const [repsDraft, setRepsDraft] = useState<{ position: number; text: string } | null>(null);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);

  const phase = view?.phase ?? null;
  const dialogOpen = dialog !== null && phase !== null && dialogApplies(dialog.kind, phase);

  // A dialog whose question no longer applies closes with no command and no focus return.
  useEffect(() => {
    if (dialog !== null && !dialogOpen) setDialog(null);
  }, [dialog, dialogOpen]);

  // Move focus to the new panel heading, but not on first render.
  useEffect(() => {
    const previous = shownKey.current;
    shownKey.current = key;
    if (previous !== null && previous !== key) {
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [key]);

  // Report the finished Workout once, whatever its outcome.
  const finishedReported = useRef(false);
  useEffect(() => {
    if (view === null || view.phase !== 'summary' || finishedReported.current) return;
    finishedReported.current = true;
    onFinished?.(view);
  }, [view, onFinished]);

  const askSkipSet = useCallback((opener: HTMLElement) => {
    setDialog({ kind: 'skipSet', opener });
  }, []);
  const askQuit = useCallback((opener: HTMLElement) => {
    setDialog({ kind: 'quit', opener });
  }, []);
  // Focus returns to the opener once the modal dialog has closed; an inert opener cannot take focus.
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const cancelDialog = useCallback(() => {
    returnFocusTo.current = dialog?.opener ?? null;
    setDialog(null);
  }, [dialog]);
  useEffect(() => {
    if (dialog !== null) return;
    const opener = returnFocusTo.current;
    returnFocusTo.current = null;
    if (opener?.isConnected) opener.focus();
  }, [dialog]);
  const confirmDialog = useCallback(() => {
    if (dialog === null) return;
    setDialog(null);
    if (dialog.kind === 'skipSet') skipSet();
    else quit();
  }, [dialog, skipSet, quit]);

  let viewerEntry: ExerciseEntry | null = null;
  let hold = false;
  let announcement = '';
  let panel;
  if (view === null) {
    panel = <PreparingPanel routine={routine} onStart={start} headingRef={headingRef} />;
  } else if (view.phase === 'exercising') {
    viewerEntry = entryOrThrow(view.slot.entryId);
    const setText = format('workout.announce.set', {
      number: String(view.slot.setNumber),
      count: String(view.slot.setCount),
      exercise: exerciseName(viewerEntry),
    });
    announcement =
      notice === 'skippedSet'
        ? format('workout.announce.skippedSet', { next: setText })
        : notice === 'skippedRest'
          ? format('workout.announce.skippedRest', { next: setText })
          : notice === 'resumed'
            ? format('workout.announce.resumed', { next: setText })
            : setText;
    const repsText =
      view.timer.kind === 'reps'
        ? repsDraft !== null && repsDraft.position === view.position
          ? repsDraft.text
          : String(view.timer.defaultReps)
        : '';
    const position = view.position;
    panel = (
      <SetPanel
        key={view.position}
        view={view}
        entry={viewerEntry}
        onConfirm={confirm}
        repsText={repsText}
        onRepsText={(text) => setRepsDraft({ position, text })}
        onPause={pause}
        onAskSkipSet={askSkipSet}
        onAskQuit={askQuit}
        headingRef={headingRef}
      />
    );
  } else if (view.phase === 'resting') {
    viewerEntry = entryOrThrow(view.next.entryId);
    const restText = format('workout.announce.rest', { exercise: exerciseName(viewerEntry) });
    announcement =
      notice === 'resumed' ? format('workout.announce.resumed', { next: restText }) : restText;
    panel = (
      <RestPanel
        view={view}
        nextEntry={viewerEntry}
        onPause={pause}
        onSkipRest={skipRest}
        onAskQuit={askQuit}
        headingRef={headingRef}
      />
    );
  } else if (view.phase === 'paused') {
    const { held } = view;
    viewerEntry = entryOrThrow(held.phase === 'exercising' ? held.slot.entryId : held.next.entryId);
    hold = true;
    announcement = t(
      view.cause === 'user' ? 'workout.announce.paused.user' : 'workout.announce.paused.auto',
    );
    panel = (
      <PausedPanel view={view} onResume={resume} onAskQuit={askQuit} headingRef={headingRef} />
    );
  } else {
    announcement = t(
      view.outcome === 'abandoned' ? 'workout.announce.ended' : 'workout.announce.summary',
    );
    panel = (
      <SummaryPanel
        view={view}
        routine={routine}
        slots={slots}
        headingRef={headingRef}
        balance={recordedBalance}
      />
    );
  }

  const bonus = String(completionBonus);

  return (
    <>
      <h1 className={styles.title}>{routineName(routine)}</h1>
      <div role="status" className={styles.visuallyHidden}>
        {announcement}
      </div>
      {viewerEntry !== null ? (
        <CoachViewer key={viewerEntry.id} exercise={viewerEntry} hold={hold} />
      ) : null}
      {panel}
      {dialog !== null && dialogOpen ? (
        <ConfirmDialog
          key={dialog.kind}
          heading={t(
            dialog.kind === 'skipSet'
              ? 'workout.skipSet.dialog.heading'
              : 'workout.quit.dialog.heading',
          )}
          text={format(
            dialog.kind === 'skipSet'
              ? 'workout.skipSet.dialog.text'
              : 'workout.quit.dialog.text',
            { bonus },
          )}
          confirmLabel={t(
            dialog.kind === 'skipSet'
              ? 'workout.skipSet.dialog.confirm'
              : 'workout.quit.dialog.confirm',
          )}
          cancelLabel={t('workout.dialog.cancel')}
          onConfirm={confirmDialog}
          onCancel={cancelDialog}
        />
      ) : null}
    </>
  );
}
