import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { findStretch, stretchSlugs } from '@/catalog';
import { ExerciseDetailScreen } from '@/ui/exercises/ExerciseDetailScreen';
import { exerciseMetadata } from '@/ui/metadata';

/**
 * Stretch detail route. Every Stretch slug is prerendered at Build time; any
 * other slug, including an Exercise slug, returns the static not-found screen
 * with HTTP 404 (Requirements 8.1, 8.2, 8.3, 8.7).
 */
export const dynamicParams = false;

interface StretchPageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export function generateStaticParams(): { slug: string }[] {
  return stretchSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: StretchPageProps): Promise<Metadata> {
  const { slug } = await params;
  const stretch = findStretch(slug);
  if (stretch === undefined) notFound();
  return exerciseMetadata(stretch);
}

export default async function StretchPage({ params }: StretchPageProps) {
  const { slug } = await params;
  const stretch = findStretch(slug);
  if (stretch === undefined) notFound();
  return <ExerciseDetailScreen exercise={stretch} />;
}
