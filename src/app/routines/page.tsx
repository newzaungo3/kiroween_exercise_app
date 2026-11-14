import { sectionMetadata } from '@/ui/metadata';
import { RoutineListScreen } from '@/ui/routines/RoutineListScreen';

export const metadata = sectionMetadata('routines');

export default function RoutinesPage() {
  return <RoutineListScreen />;
}
