import { ExerciseListScreen } from '@/ui/exercises/ExerciseListScreen';
import { sectionMetadata } from '@/ui/metadata';

export const metadata = sectionMetadata('stretches');

export default function StretchesPage() {
  return <ExerciseListScreen kind="stretch" />;
}
