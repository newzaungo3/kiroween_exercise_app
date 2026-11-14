import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { findRoutine, routines } from '@/catalog';
import { workoutMetadata } from '@/ui/metadata';
import { RecordedWorkoutScreen } from '@/ui/progress/RecordedWorkoutScreen';

/**
 * Workout_Screen route. Every Catalog Routine slug is prerendered at Build
 * time; any other slug returns the static not-found screen with HTTP 404.
 */
export const dynamicParams = false;

interface WorkoutPageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export function generateStaticParams(): { slug: string }[] {
  return routines.map((routine) => ({ slug: routine.slug }));
}

export async function generateMetadata({ params }: WorkoutPageProps): Promise<Metadata> {
  const { slug } = await params;
  const routine = findRoutine(slug);
  if (routine === undefined) notFound();
  return workoutMetadata(routine);
}

export default async function WorkoutPage({ params }: WorkoutPageProps) {
  const { slug } = await params;
  const routine = findRoutine(slug);
  if (routine === undefined) notFound();
  return <RecordedWorkoutScreen routine={routine} />;
}
