/**
 * Next.js metadata and viewport for every screen.
 *
 * Every title and description comes from the Strings_Module. The viewport
 * sets no `maximumScale` and no `userScalable`, so pinch-zoom stays on
 * (Requirements 5.5, 5.6).
 */
import type { Metadata, Viewport } from 'next';

import type { ExerciseEntry, RoutineEntry } from '@/catalog';

import { exerciseTitle } from './exercises/labels';
import { routineName } from './routines/labels';
import { type SectionId, sectionTitle } from './sections';
import { format, t } from './strings';
import { colors } from './theme/tokens';

/** Responsive, zoomable viewport shared by every screen. */
export const siteViewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: colors.bg,
};

/** Metadata for the Home_Screen, also the root layout's default. */
export function homeMetadata(): Metadata {
  return {
    title: t('home.title'),
    description: t('app.description'),
  };
}

/** Metadata for a Section's screen. */
export function sectionMetadata(id: SectionId): Metadata {
  return { title: sectionTitle(id) };
}

/** Metadata for an Exercise's Exercise_Detail_Screen. */
export function exerciseMetadata(exercise: ExerciseEntry): Metadata {
  return { title: exerciseTitle(exercise) };
}

/** Metadata for a Routine's detail screen. */
export function routineMetadata(routine: RoutineEntry): Metadata {
  return { title: format('routine.title', { routine: routineName(routine) }) };
}

/** Metadata for a Routine's Workout screen. */
export function workoutMetadata(routine: RoutineEntry): Metadata {
  return { title: format('workout.title', { routine: routineName(routine) }) };
}

/** Metadata for the not-found screen. */
export function notFoundMetadata(): Metadata {
  return { title: t('notFound.title') };
}
