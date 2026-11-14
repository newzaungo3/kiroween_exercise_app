import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { findRoutine, routines } from '@/catalog';
import { routineMetadata } from '@/ui/metadata';
import { RoutineDetailScreen } from '@/ui/routines/RoutineDetailScreen';

/**
 * Routine_Detail_Screen route. Every Catalog Routine slug is prerendered at
 * Build time; any other slug returns the static not-found screen with HTTP 404.
 */
export const dynamicParams = false;

interface RoutinePageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export function generateStaticParams(): { slug: string }[] {
  return routines.map((routine) => ({ slug: routine.slug }));
}

export async function generateMetadata({ params }: RoutinePageProps): Promise<Metadata> {
  const { slug } = await params;
  const routine = findRoutine(slug);
  if (routine === undefined) notFound();
  return routineMetadata(routine);
}

export default async function RoutinePage({ params }: RoutinePageProps) {
  const { slug } = await params;
  const routine = findRoutine(slug);
  if (routine === undefined) notFound();
  return <RoutineDetailScreen routine={routine} />;
}
