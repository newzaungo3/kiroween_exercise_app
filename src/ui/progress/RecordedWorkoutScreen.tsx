'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { RoutineEntry } from '@/catalog';
import { appearanceOf } from '@/ui/crypt/appearance';
import { resolveLook } from '@/ui/crypt/look';
import { routineName, workoutPath } from '@/ui/routines/labels';
import { format, t } from '@/ui/strings';
import workoutStyles from '@/ui/workout/WorkoutScreen.module.css';
import { WorkoutScreen } from '@/ui/workout/WorkoutScreen';
import type { SummaryView, WorkoutCheckpoint } from '@/workout-engine';

import { discardWorkout } from './discard';
import { decideGate, type GateLock } from './gate';
import { clearResumeIntent, peekResumeIntent, setResumeIntent } from './resume-intent';
import { ResumePanel } from './ResumePanel';
import { useProgress } from './useProgress';
import { workoutRecordOf } from './workout-record';

/**
 * Recording_Bridge: gates the Workout_Route on the Stored_Checkpoint, saves the
 * checkpoint while the Workout runs, and records the Workout in the
 * Progress_Store at the summary. It and discardWorkout are the only places that
 * read the wall clock for a Workout_Record.
 */
export function RecordedWorkoutScreen({ routine }: { readonly routine: RoutineEntry }) {
  const router = useRouter();
  const progress = useProgress();
  const { snapshot, saveCheckpoint, clearCheckpoint, ensureWelcomeGift, finishWorkout } = progress;
  const [locked, setLocked] = useState<GateLock | null>(null);
  const [discardedCandy, setDiscardedCandy] = useState<number | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const finished = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The Equipped_Look and the Coach name; the default look until the snapshot
  // is read. The Workout shows no Accessory_Asset fetch of its own beyond the
  // worn Accessories, so fetchAccessories stays false.
  const look = useMemo(() => resolveLook(snapshot), [snapshot]);
  const lookKey = JSON.stringify(look);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- lookKey is the value of look
  const appearance = useMemo(() => appearanceOf(look, { fetchAccessories: false }), [lookKey]);
  const coachName = snapshot?.coach.name ?? null;

  const gate = decideGate({
    snapshot,
    routineId: routine.id,
    intent: peekResumeIntent(),
    locked,
  });

  // The first non-loading, non-prompt gate decides. Lock it so the Workout's
  // own checkpoint saves cannot flip the screen. An unrestorable checkpoint is
  // cleared once, before a fresh Workout can start.
  useEffect(() => {
    if (locked !== null) return;
    if (gate.kind === 'fresh') {
      if (snapshot !== null && snapshot.checkpoint !== null) clearCheckpoint();
      setLocked('fresh');
    } else if (gate.kind === 'resumed') {
      setLocked({ resumed: gate.checkpoint });
    }
  }, [gate, locked, snapshot, clearCheckpoint]);

  // The restored Workout_Screen has mounted (child effects run first): the
  // intent is spent.
  useEffect(() => {
    if (locked !== null && locked !== 'fresh') clearResumeIntent();
  }, [locked]);

  // Move focus to the prompt heading when it appears.
  const showingPrompt = gate.kind === 'prompt';
  useEffect(() => {
    if (showingPrompt) headingRef.current?.focus();
  }, [showingPrompt]);

  const onCheckpoint = useCallback(
    (checkpoint: WorkoutCheckpoint): void => {
      if (!finished.current) saveCheckpoint(checkpoint);
    },
    [saveCheckpoint],
  );

  const onFinished = useCallback(
    (view: SummaryView): void => {
      finished.current = true;
      const record = workoutRecordOf(view, routine.id, Date.now());
      ensureWelcomeGift();
      const result = finishWorkout(record);
      if (result.recorded) setBalance(result.candyBalance);
    },
    [ensureWelcomeGift, finishWorkout, routine.id],
  );

  const onResume = useCallback((): void => {
    if (gate.kind !== 'prompt' || snapshot === null || snapshot.checkpoint === null) return;
    if (gate.info.routine.id === routine.id) {
      setLocked({ resumed: snapshot.checkpoint });
      return;
    }
    setResumeIntent(gate.info.routine.id);
    router.push(workoutPath(gate.info.routine));
  }, [gate, snapshot, routine.id, router]);

  const onDiscard = useCallback((): void => {
    if (snapshot === null || snapshot.checkpoint === null) return;
    setDiscardedCandy(discardWorkout(progress, snapshot.checkpoint));
    setLocked('fresh');
  }, [snapshot, progress]);

  if (gate.kind === 'loading') {
    return (
      <>
        <h1 className={workoutStyles.title}>{routineName(routine)}</h1>
        <p>{t('resume.loading')}</p>
      </>
    );
  }

  if (gate.kind === 'prompt') {
    return (
      <>
        <h1 className={workoutStyles.title}>{routineName(routine)}</h1>
        <ResumePanel
          info={gate.info}
          onResume={onResume}
          onDiscard={onDiscard}
          headingRef={headingRef}
        />
      </>
    );
  }

  if (gate.kind === 'resumed') {
    return (
      <WorkoutScreen
        routine={routine}
        resume={gate.checkpoint}
        onCheckpoint={onCheckpoint}
        onFinished={onFinished}
        recordedBalance={balance}
        appearance={appearance}
        coachName={coachName}
      />
    );
  }

  return (
    <>
      {discardedCandy !== null ? (
        <p>{format('resume.discarded', { candy: String(discardedCandy) })}</p>
      ) : null}
      <WorkoutScreen
        routine={routine}
        onCheckpoint={onCheckpoint}
        onFinished={onFinished}
        recordedBalance={balance}
        appearance={appearance}
        coachName={coachName}
      />
    </>
  );
}
