import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { exerciseSlugs, findExercise } from '@/catalog';
import { ExerciseDetailScreen } from '@/ui/exercises/ExerciseDetailScreen';
import { exerciseMetadata } from '@/ui/metadata';

/**
 * Exercise_Detail_Screen route. Every Catalog slug is prerendered at Build
 * time; any other slug returns the static not-found screen with HTTP 404
 * (Requirements 4.11, 14.1).
 */
export const dynamicParams = false;

interface ExercisePageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export function generateStaticParams(): { slug: string }[] {
  return exerciseSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: ExercisePageProps): Promise<Metadata> {
  const { slug } = await params;
  const exercise = findExercise(slug);
  if (exercise === undefined) notFound();
  return exerciseMetadata(exercise);
}

export default async function ExercisePage({ params }: ExercisePageProps) {
  const { slug } = await params;
  const exercise = findExercise(slug);
  if (exercise === undefined) notFound();
  return <ExerciseDetailScreen exercise={exercise} />;
}
