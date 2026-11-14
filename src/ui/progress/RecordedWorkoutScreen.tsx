'use client';

import { useCallback, useState } from 'react';

import type { RoutineEntry } from '@/catalog';
import type { SummaryView } from '@/workout-engine';
import { WorkoutScreen } from '@/ui/workout/WorkoutScreen';

import { useProgress } from './useProgress';
import { workoutRecordOf } from './workout-record';

/**
 * Recording_Bridge: renders the Workout screen and records the Workout in the
 * Progress_Store when it reaches the summary. It is the only place that reads
 * the wall clock for a Workout_Record.
 */
export function RecordedWorkoutScreen({ routine }: { readonly routine: RoutineEntry }) {
  const { ensureWelcomeGift, recordWorkout } = useProgress();
  const [balance, setBalance] = useState<number | null>(null);

  const onFinished = useCallback(
    (view: SummaryView) => {
      const record = workoutRecordOf(view, routine.id, Date.now());
      ensureWelcomeGift();
      const result = recordWorkout(record);
      if (result.recorded) setBalance(result.candyBalance);
    },
    [ensureWelcomeGift, recordWorkout, routine.id],
  );

  return <WorkoutScreen routine={routine} onFinished={onFinished} recordedBalance={balance} />;
}
