import { ExerciseListScreen } from '@/ui/exercises/ExerciseListScreen';
import { sectionMetadata } from '@/ui/metadata';

export const metadata = sectionMetadata('exercises');

export default function ExercisesPage() {
  return <ExerciseListScreen kind="exercise" />;
}
