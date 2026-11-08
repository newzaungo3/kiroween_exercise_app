import { notFoundMetadata } from '@/ui/metadata';
import { NotFoundScreen } from '@/ui/not-found/NotFoundScreen';

export const metadata = notFoundMetadata();

export default function NotFound() {
  return <NotFoundScreen />;
}
