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
}: {
  readonly exercise: ExerciseEntry;
}) {
  return <ViewerIsland exercise={exercise} />;
});
