'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo } from 'react';

import { workoutPath } from '@/ui/routines/labels';

import { describeCheckpoint, type CheckpointInfo } from './checkpoint-info';
import { discardWorkout } from './discard';
import { setResumeIntent } from './resume-intent';
import { useProgress } from './useProgress';

export interface UnfinishedWorkout {
  readonly status: 'loading' | 'none' | 'prompt';
  readonly info: CheckpointInfo | null;
  readonly resume: () => void;
  readonly discard: () => void;
}

/** Reads the Stored_Checkpoint and exposes the Resume_Prompt state. */
export function useUnfinishedWorkout(): UnfinishedWorkout {
  const router = useRouter();
  const progress = useProgress();
  const { snapshot, clearCheckpoint } = progress;
  const checkpoint = snapshot === null ? null : snapshot.checkpoint;
  const info = useMemo(
    () => (checkpoint === null ? null : describeCheckpoint(checkpoint)),
    [checkpoint],
  );

  // A checkpoint that cannot be restored is cleared, once.
  useEffect(() => {
    if (checkpoint !== null && info === null) clearCheckpoint();
  }, [checkpoint, info, clearCheckpoint]);

  const resume = useCallback((): void => {
    if (info === null) return;
    setResumeIntent(info.routine.id);
    router.push(workoutPath(info.routine));
  }, [info, router]);

  const discard = useCallback((): void => {
    if (checkpoint === null) return;
    discardWorkout(progress, checkpoint);
  }, [checkpoint, progress]);

  const status = snapshot === null ? 'loading' : info === null ? 'none' : 'prompt';
  return { status, info, resume, discard };
}
