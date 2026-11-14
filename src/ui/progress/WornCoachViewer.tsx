'use client';

/**
 * Read_Only_Bridge: the Viewer wearing the stored look. The first render
 * (server and hydration) shows the default look; the stored look applies
 * after hydration. Reads only.
 */
import { useMemo } from 'react';

import type { ExerciseEntry } from '@/catalog';
import { ViewerIsland } from '@/viewer/ViewerIsland';

import { appearanceOf } from '../crypt/appearance';
import { useCoachLook } from './useCoachLook';

export function WornCoachViewer({ exercise }: { readonly exercise: ExerciseEntry }) {
  const { read, look } = useCoachLook();
  // Undefined makes the Viewer use its default look.
  const appearance = useMemo(
    () => (read ? appearanceOf(look, { fetchAccessories: false }) : undefined),
    [read, look],
  );
  return <ViewerIsland key={exercise.id} exercise={exercise} appearance={appearance} />;
}
