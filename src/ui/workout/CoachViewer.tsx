'use client';

import { memo } from 'react';

import type { ExerciseEntry } from '@/catalog';
import { ViewerIsland } from '@/viewer/ViewerIsland';

/**
 * The Viewer for the Workout_Screen. Memoised so the 250 ms re-render of the
 * panels does not re-render it; the Catalog entry reference never changes.
 */
export const CoachViewer = memo(function CoachViewer({
  exercise,
  hold,
}: {
  readonly exercise: ExerciseEntry;
  /** True while the Workout is paused: the Coach freezes and keeps its play state. */
  readonly hold: boolean;
}) {
  return <ViewerIsland exercise={exercise} hold={hold} />;
});
