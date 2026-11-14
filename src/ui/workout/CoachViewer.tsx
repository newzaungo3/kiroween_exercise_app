'use client';

import { memo } from 'react';

import type { ExerciseEntry } from '@/catalog';
import { ViewerIsland } from '@/viewer/ViewerIsland';
import type { CoachAppearance } from '@/viewer/ViewerIsland';

/**
 * The Viewer for the Workout_Screen. Memoised so the 250 ms re-render of the
 * panels does not re-render it; the Catalog entry reference never changes.
 */
export const CoachViewer = memo(function CoachViewer({
  exercise,
  hold,
  appearance,
}: {
  readonly exercise: ExerciseEntry;
  /** True while the Workout is paused: the Coach freezes and keeps its play state. */
  readonly hold: boolean;
  /** The Equipped_Look; the caller keeps the reference stable. */
  readonly appearance?: CoachAppearance;
}) {
  return <ViewerIsland exercise={exercise} hold={hold} appearance={appearance} />;
});
